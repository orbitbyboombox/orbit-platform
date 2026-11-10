import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeD10Invoices, type D10Invoice } from "./d10-invoice-summary";
import { resolveD10CollectionEligibility } from "./d10-collection-policy";

// Supabase relation payloads are runtime-shaped joins; the selected fields are narrowed at access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const COLLECTION_TYPE = "COLLECTION_D10";

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function chileDate(reference: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reasonLabel(reason: string) {
  return {
    PAID: "El evento está completamente pagado.",
    NOT_DUE_BEFORE_EVENT: "La obligación vence después del evento; no corresponde cobrarla en D-10.",
    MISSING_DUE_DATE: "No existe una fecha contractual de vencimiento verificable.",
    INVALID_BALANCE: "El saldo canónico no es válido y requiere revisión.",
    MISSING_RECIPIENT: "El cliente no tiene un correo válido registrado.",
    CANCELLED: "El evento o la obligación está cancelado o archivado.",
  }[reason] ?? "La cobranza requiere revisión administrativa.";
}

async function recordReview(admin: ReturnType<typeof createAdminClient>, input: { projectId: string; customerId: string; eventDate: string; recipient?: string | null; reason: string; outstandingBalance: number; invoiceIds: string[] }) {
  const requestKey = `automatic-collection-d10:${input.projectId}:${input.eventDate}`;
  const existing = await admin.from("communications").select("id,status").eq("project_id", input.projectId).eq("communication_type", COLLECTION_TYPE).eq("request_key", requestKey).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "SENT" || existing.data?.status === "PENDING" || existing.data?.status === "QUEUED") return;
  const payload = {
    customer_id: input.customerId,
    project_id: input.projectId,
    channel: "GMAIL",
    direction: "OUTBOUND",
    communication_type: COLLECTION_TYPE,
    request_key: requestKey,
    thread_key: requestKey,
    subject: "Cobranza D-10 requiere revisión",
    body: input.reason,
    status: "REVIEW_REQUIRED",
    to_recipient: input.recipient ?? null,
    cc_recipients: [],
    occurred_at: new Date().toISOString(),
    failure_reason: input.reason,
    context_snapshot: { automatic: true, trigger: "D-10", eventDate: input.eventDate, outstandingBalance: input.outstandingBalance, invoiceIds: input.invoiceIds, reviewRequired: true, sendMode: "MANUAL" },
  };
  const result = existing.data?.id
    ? await admin.from("communications").update(payload).eq("id", existing.data.id)
    : await admin.from("communications").insert(payload);
  if (result.error && result.error.code !== "23505") throw result.error;
}

export type AutomaticCollectionD10Result = {
  targetDate: string;
  candidates: number;
  sent: number;
  skipped: number;
  reviewRequired: number;
  failed: number;
  pending: number;
};

export async function sendAutomaticCollectionD10(reference = new Date(), options?: { dryRun?: boolean }): Promise<AutomaticCollectionD10Result & { checks?: Array<Record<string, unknown>> }> {
  const admin = createAdminClient();
  const today = chileDate(reference);
  const targetDate = addDays(today, 10);
  const { data: projects, error: projectError } = await admin
    .from("projects")
    .select("id,customer_id,orbit_event_id,name,project_type,status,event_date,location,city,operations,customers(full_name,email,secondary_email),project_services(service_code,duration_hours),project_operational_contracts(service_start_at,service_end_at)")
    .eq("event_date", targetDate)
    .is("deleted_at", null)
    .not("status", "in", "(CANCELLED,CANCELED,ARCHIVED,DELETED)");
  if (projectError) throw projectError;

  const projectIds = (projects ?? []).map((project) => project.id);
  const { data: invoices, error: invoiceError } = projectIds.length
    ? await admin.from("accounts_receivable_projection").select("id,invoice_number,customer_id,project_id,status,effective_status,amount,paid_amount,outstanding_balance,due_date,days_remaining,currency,deleted_at,archived_at,cancelled_at").in("project_id", projectIds)
    : { data: [], error: null };
  if (invoiceError) throw invoiceError;
  const invoicesByProject = new Map<string, D10Invoice[]>();
  for (const invoice of (invoices ?? []) as D10Invoice[]) {
    if (!invoice.project_id || invoice.deleted_at || invoice.archived_at || invoice.cancelled_at) continue;
    const list = invoicesByProject.get(invoice.project_id) ?? [];
    list.push(invoice);
    invoicesByProject.set(invoice.project_id, list);
  }
  if (options?.dryRun) {
    const checks = (projects ?? []).map((project) => {
      const summary = summarizeD10Invoices(invoicesByProject.get(project.id) ?? []);
      const representative = summary.representative;
      const customer = first(project.customers);
      const eligibility = resolveD10CollectionEligibility({ eventDate: project.event_date, dueDate: representative?.due_date, outstandingBalance: summary.outstandingBalance, recipient: customer?.email, status: representative?.status ?? project.status });
      return { projectId: project.id, orbitEventId: project.orbit_event_id, eventDate: project.event_date, balance: summary.outstandingBalance, dueDate: representative?.due_date ?? null, eligibility: eligibility.reason, eligible: eligibility.eligible };
    });
    return { targetDate, candidates: checks.length, sent: 0, skipped: 0, reviewRequired: checks.filter((item) => !item.eligible).length, failed: 0, pending: 0, checks };
  }

  let skipped = 0, reviewRequired = 0;
  for (const project of (projects ?? []) as Row[]) {
    const customer = first<Row>(project.customers);
    const summary = summarizeD10Invoices(invoicesByProject.get(project.id) ?? []);
    const representative = summary.representative;
    const eligibility = resolveD10CollectionEligibility({
      eventDate: project.event_date,
      dueDate: representative?.due_date,
      outstandingBalance: summary.outstandingBalance,
      recipient: customer?.email,
      status: representative?.status ?? project.status,
    });

    if (eligibility.reason === "PAID") {
      skipped += 1;
      continue;
    }

    const reason = eligibility.eligible
      ? `Saldo pendiente D-10: ${summary.outstandingBalance}. Revisa el historial y decide manualmente si enviar la cobranza.`
      : reasonLabel(eligibility.reason);
    reviewRequired += 1;
    await recordReview(admin, {
      projectId: project.id,
      customerId: project.customer_id,
      eventDate: targetDate,
      recipient: customer?.email,
      reason,
      outstandingBalance: summary.outstandingBalance,
      invoiceIds: summary.invoices.map((item) => item.id),
    });
  }

  // The scheduled worker is notification-only. Collection email delivery is
  // available solely through the Founder/Admin manual review action.
  return { targetDate, candidates: projects?.length ?? 0, sent: 0, skipped, reviewRequired, failed: 0, pending: 0 };
}
