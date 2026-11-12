import "server-only";
import { isNoIssueObservation, mapIncidentObservation, type IncidentObservation } from "@/features/resources/incident-observation";
import { after } from "next/server";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
import { isPhysicalConfigurationReady } from "./diagnostic-model";
import { founderActionHref, isFounderActionVisible } from "./visibility";

export type FounderActionPriority = "P0" | "P1" | "P2" | "P3";

export type FounderActionItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  priority: FounderActionPriority;
  category: string;
  read: boolean;
  cta: string;
  incident?: IncidentObservation;
};

export type FounderActionCenter = {
  count: number;
  items: FounderActionItem[];
};

const priority = (type: string, value: string): FounderActionPriority => {
  if (value === "CRITICAL") return "P0";
  if (
    [
      "STAFF_ONBOARDING_REVIEW_REQUIRED",
      "STAFF_EXPENSE_REVIEW_REQUIRED",
      "STAFF_BOLETA_REVIEW_REQUIRED",
    ].includes(type)
  )
    return "P1";
  return value === "HIGH" ? "P2" : "P3";
};

const cta = (type: string) =>
  type === "STAFF_ONBOARDING_REVIEW_REQUIRED"
    ? "REVISAR OPERADOR"
    : type === "STAFF_EXPENSE_REVIEW_REQUIRED"
      ? "REVISAR GASTO"
      : type === "STAFF_BOLETA_REVIEW_REQUIRED"
        ? "REVISAR BOLETA"
        : type === "STAFF_OPERATOR_INCIDENT"
          ? "REVISAR CAJA / EQUIPO"
        : type === "PHYSICAL_CONFIGURATION_MISSING"
          ? "DEFINIR CONFIGURACIÓN"
          : type.startsWith("SALES_")
            ? "REVISAR LEAD"
            : "REVISAR";

const canonicalFounderActionTypeList = [
  "STAFF_ONBOARDING_REVIEW_REQUIRED",
  "STAFF_EXPENSE_REVIEW_REQUIRED",
  "STAFF_BOLETA_REVIEW_REQUIRED",
  "STAFF_OPERATOR_INCIDENT",
  "HEALTH_WARNING",
  "EVENT_NOT_READY",
  "SALES_LEAD_UNATTENDED",
  "SALES_QUOTE_NO_FOLLOWUP",
  "SALES_FOLLOWUP_OVERDUE",
  "SALES_NO_NEXT_ACTION",
  "SALES_CUSTOMER_REPLIED",
  "SALES_RESERVATION_PENDING",
  "SALES_LEAD_STALLED",
  "WHATSAPP_WAITING_FOR_BOOMBOX",
  "WHATSAPP_HUMAN_STALE",
  "WHATSAPP_UNREAD_CRITICAL",
  "PHYSICAL_CONFIGURATION_MISSING",
] as const;
const canonicalFounderActionTypes = new Set<string>(
  canonicalFounderActionTypeList,
);

const reconcileFounderActionSources = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const [
      { error: salesError },
      { error: whatsappError },
      { error: operationalError },
    ] = await Promise.all([
      admin.rpc("reconcile_sales_pipeline_founder_alerts"),
      admin.rpc("reconcile_whatsapp_founder_alerts"),
      admin.rpc("reconcile_operational_agenda_alerts"),
    ]);
    for (const error of [salesError, whatsappError, operationalError]) {
      if (error && !["42883", "PGRST202"].includes(error.code ?? "")) throw error;
    }

    const [{ error: closedSalesError }, { error: closedStateError }] =
      await Promise.all([
        admin.rpc("close_noncommercial_sales_alerts"),
        admin.rpc("close_closed_sales_alerts"),
      ]);
    for (const error of [closedSalesError, closedStateError]) {
      if (error && !["42883", "PGRST202"].includes(error.code ?? "")) throw error;
    }

    const { error: reconciliationError } = await admin.rpc(
      "reconcile_founder_action_alerts",
    );
    if (reconciliationError) throw reconciliationError;
    return true;
  },
  ["founder-action-reconciliation-v2"],
  { revalidate: 30 },
);

async function loadAllFounderNotifications(admin: ReturnType<typeof createAdminClient>) {
  const page = (offset: number) => admin.from("internal_notifications").select("id,notification_type,title,message,created_at,category,priority,related_href,entity_type,entity_id,metadata,projects(pipeline_stage,operations,project_operational_contracts(readiness_status))")
    .eq("action_required", true).neq("status", "RESOLVED")
    .in("notification_type", [...canonicalFounderActionTypeList])
    .order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
  const result = await page(0);
  if (result.error) return result;
  const rows = [...(result.data ?? [])];
  for (let offset = 500; rows.length === offset; offset += 500) {
    const next = await page(offset);
    if (next.error) return next;
    rows.push(...(next.data ?? []));
    if ((next.data?.length ?? 0) < 500) break;
  }
  return { ...result, data: rows };
}

const loadFounderActionCenterCached = cache(
  async (userId: string): Promise<FounderActionCenter> => {
    const admin = createAdminClient();
    if (!isReadOnlyVisualPreview()) {
      // Keep alert reconciliation off the dashboard's critical render path.
      // Existing notification rows are returned immediately; reconciliation
      // still runs after the response and retains its 30-second cache.
      after(async () => {
        try {
          await reconcileFounderActionSources();
        } catch (error) {
          console.error(
            "[founder-action-center] Deferred reconciliation failed",
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      });
    }
    const [
      { data: rows, error },
      { data: states, error: statesError },
      { data: overdueInvoices, error: overdueError },
      { data: reviewedStates, error: reviewedError },
    ] = await Promise.all([
      loadAllFounderNotifications(admin),
      admin
        .from("notification_user_states")
        .select("notification_id,read_at")
        .eq("user_id", userId),
      admin.from("founder_action_user_states").select("action_key").eq("user_id", userId),
      admin
        .from("accounts_receivable_projection")
        .select("id,invoice_number,due_date,outstanding_balance,projects(name)")
        .gt("outstanding_balance", 0)
        .lt("days_remaining", 0)
        .not("effective_status", "in", "(PAID,CANCELLED,ARCHIVED)")
        .order("due_date", { ascending: true })
        .limit(100),
    ]);
    if (error || statesError || overdueError || reviewedError)
      throw error ?? statesError ?? overdueError ?? reviewedError;
    const reviewedIds = new Set((reviewedStates ?? []).map(row => row.action_key));
    const incidentIds = (rows ?? []).filter(row => row.notification_type === "STAFF_OPERATOR_INCIDENT").map(row => row.entity_id).filter(Boolean);
    const incidentResult = incidentIds.length ? await admin.from("event_incidents").select("id,project_id,description,status,resolution,created_at,operational_assets(asset_code),projects(name),staff(first_name,last_name)").in("id", incidentIds) : { data: [], error: null };
    if (incidentResult.error) throw incidentResult.error;
    const incidentById = new Map((incidentResult.data ?? []).map(row => [row.id, row]));
    const readIds = new Set(
      (states ?? [])
        .filter((state) => state.read_at)
        .map((state) => state.notification_id),
    );
    const projected = (rows ?? [])
      .filter((row) => {
        if (!canonicalFounderActionTypes.has(row.notification_type))
          return false;
        if (row.notification_type === "STAFF_OPERATOR_INCIDENT") {
          const incident = incidentById.get(row.entity_id);
          if (incident && (incident.status === "RESOLVED" || isNoIssueObservation(incident.description))) return false;
        }
        const project = Array.isArray(row.projects)
          ? row.projects[0]
          : row.projects;
        const operations =
          project?.operations && typeof project.operations === "object"
            ? (project.operations as Record<string, unknown>)
            : {};
        const contracts = project?.project_operational_contracts;
        const contract = Array.isArray(contracts) ? contracts[0] : contracts;
        if (row.notification_type === "EVENT_NOT_READY" && contract?.readiness_status === "READY") return false;
        if (row.notification_type === "PHYSICAL_CONFIGURATION_MISSING" && isPhysicalConfigurationReady(operations.physicalConfiguration)) return false;
        const stage = String(
          project?.pipeline_stage ?? operations.pipelineStage ?? "",
        ).toUpperCase();
        return isFounderActionVisible(row.notification_type, stage);
      })
      .map((row) => ({
        id: row.id,
        type: row.notification_type,
        incident: row.notification_type === "STAFF_OPERATOR_INCIDENT" && incidentById.has(row.entity_id) ? mapIncidentObservation(incidentById.get(row.entity_id)!, (row.metadata ?? {}) as Record<string, unknown>) : undefined,
        title: row.title,
        detail: row.message,
        href: founderActionHref(
          row.notification_type,
          row.entity_id,
          row.related_href,
        ),
        createdAt: row.created_at,
        priority: priority(row.notification_type, row.priority),
        category: row.category,
        read: readIds.has(row.id),
        cta: cta(row.notification_type),
        canonicalKey: `${row.notification_type}:${row.entity_type ?? row.notification_type}:${row.entity_id ?? row.id}`,
      }))
      .sort(
        (a, b) =>
          a.priority.localeCompare(b.priority) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    const seen = new Set<string>();
    const items: FounderActionItem[] = projected.filter(item => {
      if (seen.has(item.canonicalKey) || reviewedIds.has(item.id)) return false;
      seen.add(item.canonicalKey); return true;
    });
    for (const invoice of overdueInvoices ?? []) {
      const project = Array.isArray(invoice.projects)
        ? invoice.projects[0]
        : invoice.projects;
      const outstanding = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(Number(invoice.outstanding_balance ?? 0));
      items.push({
        category: "PAYMENTS",
        createdAt: invoice.due_date
          ? `${invoice.due_date}T12:00:00-04:00`
          : new Date().toISOString(),
        cta: "ABRIR FACTURA",
        detail: `${project?.name ?? "Evento"} · saldo ${outstanding} · venció ${invoice.due_date ?? "sin fecha"}`,
        href: `/finance/receivables?invoice=${encodeURIComponent(invoice.id)}`,
        id: `founder-action:invoice:${invoice.id}`,
        priority: "P2",
        read: false,
        title: `Factura vencida · ${invoice.invoice_number}`,
        type: "INVOICE_OVERDUE",
      });
    }
    const visibleItems = items.filter(item => !reviewedIds.has(item.id));
    visibleItems.sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return { count: visibleItems.length, items: visibleItems };
  },
);

export async function loadFounderActionDismissals(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("founder_action_user_states")
    .select("action_key")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.action_key));
}

export async function loadFounderActionCenter(userId: string) {
  // Canonical active records cannot be hidden with a personal dismissal.
  return loadFounderActionCenterCached(userId);
}

export async function loadFounderActionCount(userId: string) {
  return (await loadFounderActionCenter(userId)).count;
}
