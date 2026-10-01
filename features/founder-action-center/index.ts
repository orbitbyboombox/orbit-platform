import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
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

const loadFounderActionCenterCached = cache(
  async (userId: string): Promise<FounderActionCenter> => {
    const admin = createAdminClient();
    if (!isReadOnlyVisualPreview()) {
      await reconcileFounderActionSources();
    }
    const [
      { data: rows, error },
      { data: states, error: statesError },
      { data: overdueInvoices, error: overdueError },
    ] = await Promise.all([
      admin
        .from("internal_notifications")
        .select(
          "id,notification_type,title,message,created_at,category,priority,related_href,entity_type,entity_id,projects(pipeline_stage,operations)",
        )
        .eq("action_required", true)
        .neq("status", "RESOLVED")
        .in("notification_type", [...canonicalFounderActionTypeList])
        .order("created_at", { ascending: false })
        .limit(250),
      admin
        .from("notification_user_states")
        .select("notification_id,read_at")
        .eq("user_id", userId),
      admin
        .from("accounts_receivable_projection")
        .select("id,invoice_number,due_date,outstanding_balance,projects(name)")
        .gt("outstanding_balance", 0)
        .lt("days_remaining", 0)
        .not("effective_status", "in", "(PAID,CANCELLED,ARCHIVED)")
        .order("due_date", { ascending: true })
        .limit(100),
    ]);
    if (error || statesError || overdueError)
      throw error ?? statesError ?? overdueError;
    const readIds = new Set(
      (states ?? [])
        .filter((state) => state.read_at)
        .map((state) => state.notification_id),
    );
    const projected = (rows ?? [])
      .filter((row) => {
        if (!canonicalFounderActionTypes.has(row.notification_type))
          return false;
        const project = Array.isArray(row.projects)
          ? row.projects[0]
          : row.projects;
        const operations =
          project?.operations && typeof project.operations === "object"
            ? (project.operations as Record<string, unknown>)
            : {};
        const stage = String(
          project?.pipeline_stage ?? operations.pipelineStage ?? "",
        ).toUpperCase();
        return isFounderActionVisible(row.notification_type, stage);
      })
      .map((row) => ({
        id: row.id,
        type: row.notification_type,
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
        canonicalKey: `${row.entity_type ?? row.notification_type}:${row.entity_id ?? row.id}`,
      }))
      .sort(
        (a, b) =>
          a.priority.localeCompare(b.priority) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    const physicalItems = projected.filter(
      (item) => item.type === "PHYSICAL_CONFIGURATION_MISSING",
    );
    const seen = new Set<string>();
    const items: FounderActionItem[] = projected
      .filter((item) => item.type !== "PHYSICAL_CONFIGURATION_MISSING")
      .filter((item) => {
        if (seen.has(item.canonicalKey)) return false;
        seen.add(item.canonicalKey);
        return true;
      });
    if (physicalItems.length > 0) {
      const first = physicalItems[0];
      items.splice(items.length, 0, {
        id: "PHYSICAL_CONFIGURATION_MISSING_GROUP",
        type: "PHYSICAL_CONFIGURATION_MISSING",
        title: `${physicalItems.length} eventos sin configuración física`,
        detail: "Eventos próximos requieren definir una configuración física.",
        href: "/operations/week#physical-configuration-missing",
        createdAt: first.createdAt,
        priority: physicalItems.some((item) => item.priority === "P0")
          ? "P0"
          : physicalItems.some((item) => item.priority === "P2")
            ? "P2"
            : "P3",
        category: "OPERATIONS",
        read: physicalItems.every((item) => item.read),
        cta: "DEFINIR CONFIGURACIÓN",
      });
    }
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
    items.sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return { count: items.length, items };
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
  const [center, dismissed] = await Promise.all([
    loadFounderActionCenterCached(userId),
    loadFounderActionDismissals(userId),
  ]);
  const items = center.items.filter((item) => !dismissed.has(item.id));
  return { count: items.length, items };
}

const loadFounderActionCountCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const [
      { count: notificationCount, error: notificationError },
      { count: overdueCount, error: overdueError },
    ] = await Promise.all([
      admin
        .from("internal_notifications")
        .select("id", { count: "exact", head: true })
        .eq("action_required", true)
        .neq("status", "RESOLVED"),
      admin
        .from("accounts_receivable_projection")
        .select("id", { count: "exact", head: true })
        .gt("outstanding_balance", 0)
        .lt("days_remaining", 0)
        .not("effective_status", "in", "(PAID,CANCELLED,ARCHIVED)"),
    ]);
    if (notificationError || overdueError)
      throw notificationError ?? overdueError;
    return (notificationCount ?? 0) + (overdueCount ?? 0);
  },
  ["founder-action-count-v2"],
  { revalidate: 15 },
);

export async function loadFounderActionCount(userId: string) {
  // Shared CEO/Admin badge count; short cache removes two DB reads from most
  // internal navigations while keeping operational freshness.
  void userId;
  return loadFounderActionCountCached();
}
