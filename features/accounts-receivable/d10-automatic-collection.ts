import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { resolveCollectionBankDetails } from "./collection-bank-details";
import { buildCollectionEmailDraft, buildCollectionEmailHtml } from "./collection-email.template";
import { resolveCollectionEventDetail } from "./collection-event-detail";
import { summarizeD10Invoices, type D10Invoice } from "./d10-invoice-summary";
import { resolveD10CollectionEligibility } from "./d10-collection-policy";
import { deliverClaimedD10 } from "./d10-delivery";
import { GoogleGmailApiProvider, InMemoryGoogleGmailLiveProvider, type GoogleGmailLiveProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";

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

async function recordReview(admin: ReturnType<typeof createAdminClient>, input: { projectId: string; customerId: string; eventDate: string; recipient?: string | null; reason: string }) {
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
    context_snapshot: { automatic: true, trigger: "D-10", eventDate: input.eventDate, reviewRequired: true },
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

  const company = await loadCompanySettings(admin);
  const bankDetails = resolveCollectionBankDetails(company);
  const bankConfigured = [bankDetails.bankName, bankDetails.accountType, bankDetails.accountNumber, bankDetails.rut, bankDetails.email].every(Boolean);
  let sender: GoogleGmailLiveProvider | null = null;
  let sent = 0, skipped = 0, reviewRequired = 0, failed = 0, pending = 0;
  for (const project of (projects ?? []) as Row[]) {
    const customer = first<Row>(project.customers);
    const summary = summarizeD10Invoices(invoicesByProject.get(project.id) ?? []);
    const representative = summary.representative;
    const eligibility = resolveD10CollectionEligibility({ eventDate: project.event_date, dueDate: representative?.due_date, outstandingBalance: summary.outstandingBalance, recipient: customer?.email, status: representative?.status ?? project.status });
    if (!eligibility.eligible) {
      if (eligibility.reason === "PAID") skipped += 1;
      else { reviewRequired += 1; await recordReview(admin, { projectId: project.id, customerId: project.customer_id, eventDate: targetDate, recipient: customer?.email, reason: reasonLabel(eligibility.reason) }); }
      continue;
    }
    if (!bankConfigured) {
      reviewRequired += 1;
      await recordReview(admin, { projectId: project.id, customerId: project.customer_id, eventDate: targetDate, recipient: customer?.email, reason: "Los datos bancarios canónicos no están completos; la cobranza quedó en REVISIÓN REQUERIDA." });
      continue;
    }
    const detail = resolveCollectionEventDetail({ eventDate: project.event_date, location: project.location, city: project.city, operations: project.operations, services: (project.project_services ?? []).map((item: Row) => ({ serviceCode: item.service_code, durationHours: Number(item.duration_hours ?? 0) || null })), operationalContract: (() => { const item = first<Row>(project.project_operational_contracts); return item ? { serviceStartAt: item.service_start_at, serviceEndAt: item.service_end_at } : null; })() });
    const draft = buildCollectionEmailDraft({ invoiceNumber: representative?.invoice_number ?? project.orbit_event_id, customerName: customer?.full_name ?? "Cliente", customerEmail: customer?.email ?? null, customerSecondaryEmail: customer?.secondary_email ?? null, projectName: project.name ?? "BOOMBOX", amount: summary.amount, outstandingBalance: summary.outstandingBalance, dueDate: representative?.due_date ?? null, eventDate: detail.eventDate, eventLocation: detail.eventLocation, service: detail.service, eventDuration: detail.eventDuration, daysRemaining: representative?.days_remaining ?? null, status: summary.outstandingBalance > 0 && representative?.due_date && representative.due_date < today ? "OVERDUE" : "PENDING", collectionActions: [] } as any, bankDetails);
    const requestKey = `automatic-collection-d10:${project.id}:${targetDate}`;
    let communicationId: string | null = null;
    const outcome = await deliverClaimedD10({
      claim: async () => {
        const insert = await admin.from("communications").insert({ customer_id: project.customer_id, project_id: project.id, channel: "GMAIL", direction: "OUTBOUND", communication_type: COLLECTION_TYPE, request_key: requestKey, thread_key: requestKey, subject: draft.subject, body: draft.body, status: "QUEUED", occurred_at: reference.toISOString(), to_recipient: draft.to, cc_recipients: draft.cc, context_snapshot: { automatic: true, trigger: "D-10", eventDate: targetDate, outstandingBalance: summary.outstandingBalance, invoiceIds: summary.invoices.map((item) => item.id) } }).select("id").single();
        if (insert.error?.code === "23505") return false;
        if (insert.error || !insert.data) throw insert.error ?? new Error("No se pudo reservar la cobranza D-10.");
        communicationId = insert.data.id;
        return true;
      },
      sendOnce: async () => {
        if (!sender) sender = process.env.VERCEL_ENV === "preview" && process.env.D10_QA_EMAIL_MOCK === "true" ? new InMemoryGoogleGmailLiveProvider() : new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
        return sender.send({ maxSendAttempts: 1, to: draft.to, cc: draft.cc, idempotencyKey: requestKey, subject: draft.subject, textBody: draft.body, htmlBody: buildCollectionEmailHtml(draft), driveFileIds: [] });
      },
      markSent: async (delivery) => { const result = await admin.from("communications").update({ status: "SENT", sent_at: new Date().toISOString(), external_message_id: delivery.messageId, thread_key: delivery.threadId, failure_reason: null }).eq("id", communicationId); if (result.error) throw result.error; },
      markPending: async (error) => { await admin.from("communications").update({ status: "PENDING", failure_reason: error instanceof Error ? error.message.slice(0, 2_000) : "Resultado de Gmail incierto" }).eq("id", communicationId); },
      markFailed: async (error) => { await admin.from("communications").update({ status: "FAILED", failure_reason: error instanceof Error ? error.message.slice(0, 2_000) : "Error de envío" }).eq("id", communicationId); },
    });
    if (outcome === "SENT") sent += 1;
    else if (outcome === "SKIPPED") skipped += 1;
    else if (outcome === "PENDING") pending += 1;
    else failed += 1;
  }
  return { targetDate, candidates: projects?.length ?? 0, sent, skipped, reviewRequired, failed, pending };
}
