import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettingsCached } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, GoogleGmailDeliveryOutcomeUnknownError, InMemoryGoogleGmailLiveProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { resolveCollectionBankDetails } from "./collection-bank-details";
import { buildCollectionEmailDraft, buildCollectionEmailHtml } from "./collection-email.template";
import { resolveCollectionEventDetail } from "./collection-event-detail";
import { selectD10CollectibleInvoices, summarizeD10Invoices, type D10Invoice } from "./d10-invoice-summary";
import { resolveD10CollectionEligibility } from "./d10-collection-policy";
import { deliverClaimedD10 } from "./d10-delivery";

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
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.round((new Date(end + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime()) / 86_400_000);
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

function requestKey(projectId: string, eventDate: string) {
  return "automatic-collection-d10:" + projectId + ":" + eventDate;
}

async function loadExisting(admin: ReturnType<typeof createAdminClient>, projectId: string, key: string) {
  const result = await admin.from("communications")
    .select("id,status")
    .eq("project_id", projectId)
    .eq("communication_type", COLLECTION_TYPE)
    .eq("request_key", key)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function recordReview(
  admin: ReturnType<typeof createAdminClient>,
  input: { projectId: string; customerId: string; eventDate: string; eventName: string; recipient?: string | null; reason: string; outstandingBalance: number; invoiceIds: string[] },
) {
  const key = requestKey(input.projectId, input.eventDate);
  const existing = await loadExisting(admin, input.projectId, key);
  if (existing?.status === "SENT" || existing?.status === "PENDING" || existing?.status === "QUEUED") return;
  const payload = {
    customer_id: input.customerId,
    project_id: input.projectId,
    channel: "GMAIL",
    direction: "OUTBOUND",
    communication_type: COLLECTION_TYPE,
    request_key: key,
    thread_key: key,
    subject: "Cobranza D-10 requiere revisión",
    body: input.reason,
    status: "REVIEW_REQUIRED",
    to_recipient: input.recipient ?? null,
    cc_recipients: [],
    occurred_at: new Date().toISOString(),
    failure_reason: input.reason,
    context_snapshot: { automatic: true, trigger: "D-10", eventName: input.eventName, eventDate: input.eventDate, outstandingBalance: input.outstandingBalance, invoiceIds: input.invoiceIds, reviewRequired: true, sendMode: "AUTOMATIC" },
  };
  if (existing?.id) {
    const result = await admin.from("communications").update(payload).eq("id", existing.id).eq("status", "REVIEW_REQUIRED");
    if (result.error) throw result.error;
    return;
  }
  const result = await admin.from("communications").insert(payload);
  if (result.error && result.error.code !== "23505") throw result.error;
}

/** Retain the audit row while dismissing an unsent review when the canonical balance becomes zero. */
async function dismissUnsentReview(admin: ReturnType<typeof createAdminClient>, projectId: string, eventDate: string, reason: string) {
  const existing = await loadExisting(admin, projectId, requestKey(projectId, eventDate));
  if (!existing?.id || existing.status !== "REVIEW_REQUIRED") return;
  const result = await admin.from("communications").update({
    status: "SKIPPED",
    failure_reason: reason,
    occurred_at: new Date().toISOString(),
    context_snapshot: { automatic: true, trigger: "D-10", eventDate, outstandingBalance: 0, dismissed: true, sendMode: "AUTOMATIC" },
  }).eq("id", existing.id).eq("status", "REVIEW_REQUIRED");
  if (result.error) throw result.error;
}

async function claimAutomaticSend(
  admin: ReturnType<typeof createAdminClient>,
  payload: Row,
): Promise<string | null> {
  const existing = await loadExisting(admin, payload.project_id, payload.request_key);
  if (existing?.id) {
    if (existing.status !== "REVIEW_REQUIRED") return null;
    const updated = await admin.from("communications")
      .update(payload)
      .eq("id", existing.id)
      .eq("status", "REVIEW_REQUIRED")
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    return updated.data?.id ?? null;
  }
  const inserted = await admin.from("communications")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (inserted.error?.code === "23505") return null;
  if (inserted.error) throw inserted.error;
  return inserted.data?.id ?? null;
}

async function sendAutomaticCollection(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    project: Row;
    customer: Row;
    eventDate: string;
    today: string;
    invoices: D10Invoice[];
    outstandingBalance: number;
  },
): Promise<"SENT" | "SKIPPED" | "FAILED" | "PENDING"> {
  const { project, customer, eventDate, today, invoices, outstandingBalance } = input;
  const representative = [...invoices].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  if (!representative?.due_date) return "SKIPPED";
  const recipients = normalizeEmailRecipients({ to: String(customer.email ?? ""), cc: String(customer.secondary_email ?? "") });
  const detail = resolveCollectionEventDetail({
    eventDate: project.event_date,
    location: project.location,
    city: project.city,
    operations: project.operations,
    services: (project.project_services ?? []).map((item: Row) => ({ serviceCode: item.service_code, durationHours: Number(item.duration_hours ?? 0) || null })),
    operationalContract: first<Row>(project.project_operational_contracts)
      ? { serviceStartAt: first<Row>(project.project_operational_contracts)?.service_start_at, serviceEndAt: first<Row>(project.project_operational_contracts)?.service_end_at }
      : null,
  });
  const amount = invoices.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const paidAmount = invoices.reduce((sum, item) => sum + Number(item.paid_amount ?? 0), 0);
  const daysRemaining = daysBetween(today, String(representative.due_date));
  const status = daysRemaining < 0 ? "OVERDUE" : paidAmount > 0 ? "PARTIALLY_PAID" : "ISSUED";
  const bankDetails = resolveCollectionBankDetails(await loadCompanySettingsCached());
  const draft = buildCollectionEmailDraft({
    invoiceNumber: invoices.map((item) => item.invoice_number).filter(Boolean).join(", ") || "D-10",
    customerName: String(customer.full_name ?? "Cliente"),
    customerEmail: recipients.to,
    customerSecondaryEmail: recipients.cc[0] ?? null,
    projectName: String(project.name ?? "BOOMBOX"),
    amount,
    paidAmount,
    outstandingBalance,
    dueDate: representative.due_date,
    eventDate: detail.eventDate,
    eventLocation: detail.eventLocation,
    service: detail.service,
    eventDuration: detail.eventDuration,
    daysRemaining,
    status,
    collectionActions: [],
  }, bankDetails);
  const key = requestKey(project.id, eventDate);
  const occurredAt = new Date().toISOString();
  const payload = {
    customer_id: project.customer_id,
    project_id: project.id,
    channel: "GMAIL",
    direction: "OUTBOUND",
    communication_type: COLLECTION_TYPE,
    request_key: key,
    thread_key: key,
    subject: draft.subject,
    body: draft.body,
    status: "PENDING",
    to_recipient: recipients.to,
    cc_recipients: recipients.cc,
    occurred_at: occurredAt,
    sent_at: null,
    external_message_id: null,
    failure_reason: null,
    context_snapshot: {
      automatic: true,
      trigger: "D-10",
      sendMode: "AUTOMATIC",
      eventName: project.name,
      eventDate,
      outstandingBalance,
      dueDate: representative.due_date,
      invoiceIds: invoices.map((item) => item.id),
      customerName: customer.full_name,
      recipient: recipients.to,
    },
  };
  const communicationId = await claimAutomaticSend(admin, payload);
  if (!communicationId) return "SKIPPED";

  const delivery = await deliverClaimedD10({
    claim: async () => true,
    sendOnce: async () => {
      const message = {
        to: recipients.to,
        cc: recipients.cc,
        bcc: ["matias.maira.larrain@gmail.com"],
        subject: draft.subject,
        textBody: draft.body,
        htmlBody: buildCollectionEmailHtml(draft),
        driveFileIds: [],
        idempotencyKey: key,
        maxSendAttempts: 1,
      };
      if (process.env.VERCEL_ENV === "preview" && process.env.D10_QA_EMAIL_MOCK === "true") {
        return new InMemoryGoogleGmailLiveProvider().send({ ...message, bcc: [], from: '"BOOMBOX QA" <qa@synthetic.invalid>' });
      }
      const workspace = await loadGoogleWorkspaceConnection();
      const senderEmail = workspace.workspaceAccount?.trim();
      if (!senderEmail) throw new Error("No se pudo identificar la cuenta remitente de Google Workspace.");
      return new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({
        ...message,
        from: '"BOOMBOX Cabinas Fotográficas" <' + senderEmail + '>',
      });
    },
    markSent: async (result) => {
      const sentAt = new Date().toISOString();
      const updated = await admin.from("communications").update({
        status: "SENT",
        external_message_id: result.messageId,
        sent_at: sentAt,
        occurred_at: sentAt,
        failure_reason: null,
      }).eq("id", communicationId);
      if (updated.error) throw updated.error;
    },
    markPending: async (error) => {
      await admin.from("communications").update({
        status: "PENDING",
        failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Resultado Gmail incierto; no se reenviará automáticamente.",
        occurred_at: new Date().toISOString(),
      }).eq("id", communicationId);
    },
    markFailed: async (error) => {
      await admin.from("communications").update({
        status: "FAILED",
        failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Error de envío",
        occurred_at: new Date().toISOString(),
      }).eq("id", communicationId);
    },
  });
  return delivery;
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
      const customer = first(project.customers);
      const collectible = selectD10CollectibleInvoices(invoicesByProject.get(project.id) ?? [], targetDate);
      const collectibleBalance = collectible.reduce((sum, invoice) => sum + Number(invoice.outstanding_balance ?? 0), 0);
      const futureBalance = Math.max(0, summary.outstandingBalance - collectibleBalance);
      const representative = collectible[0] ?? summary.representative;
      const eligibility = resolveD10CollectionEligibility({ eventDate: project.event_date, dueDate: representative?.due_date, outstandingBalance: collectibleBalance || summary.outstandingBalance, recipient: customer?.email, status: representative?.status ?? project.status });
      return {
        projectId: project.id,
        orbitEventId: project.orbit_event_id,
        eventDate: project.event_date,
        balance: summary.outstandingBalance,
        collectibleBalance,
        futureBalance,
        dueDate: representative?.due_date ?? null,
        eligibility: eligibility.reason,
        eligible: eligibility.eligible && collectibleBalance > 0,
      };
    });
    return { targetDate, candidates: checks.length, sent: 0, skipped: 0, reviewRequired: checks.filter((item) => !item.eligible).length, failed: 0, pending: 0, checks };
  }

  let sent = 0, skipped = 0, reviewRequired = 0, failed = 0, pending = 0;
  for (const project of (projects ?? []) as Row[]) {
    const customer = first<Row>(project.customers);
    const summary = summarizeD10Invoices(invoicesByProject.get(project.id) ?? []);
    const collectibleInvoices = selectD10CollectibleInvoices(invoicesByProject.get(project.id) ?? [], targetDate);
    const collectibleBalance = collectibleInvoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_balance ?? 0), 0);

    if (!summary.valid) {
      reviewRequired += 1;
      await recordReview(admin, {
        projectId: project.id, customerId: project.customer_id, eventDate: targetDate,
        eventName: project.name, recipient: customer?.email, reason: reasonLabel("INVALID_BALANCE"),
        outstandingBalance: summary.outstandingBalance, invoiceIds: summary.invoices.map((item) => item.id),
      });
      continue;
    }

    if (summary.outstandingBalance === 0) {
      skipped += 1;
      await dismissUnsentReview(admin, project.id, targetDate, "Cobranza D-10 descartada: el saldo canónico llegó a cero.");
      continue;
    }

    const representative = collectibleInvoices[0] ?? summary.representative;
    const eligibility = resolveD10CollectionEligibility({
      eventDate: project.event_date,
      dueDate: representative?.due_date,
      outstandingBalance: collectibleBalance,
      recipient: customer?.email,
      status: representative?.status ?? project.status,
    });
    if (!collectibleInvoices.length || !eligibility.eligible) {
      reviewRequired += 1;
      await recordReview(admin, {
        projectId: project.id, customerId: project.customer_id, eventDate: targetDate,
        eventName: project.name, recipient: customer?.email,
        reason: reasonLabel(collectibleBalance > 0 ? eligibility.reason : "NOT_DUE_BEFORE_EVENT"),
        outstandingBalance: summary.outstandingBalance, invoiceIds: summary.invoices.map((item) => item.id),
      });
      continue;
    }

    const outcome = await sendAutomaticCollection(admin, {
      project,
      customer: customer ?? {},
      eventDate: targetDate,
      today,
      invoices: collectibleInvoices,
      outstandingBalance: collectibleBalance,
    });
    if (outcome === "SENT") sent += 1;
    else if (outcome === "FAILED") failed += 1;
    else if (outcome === "PENDING") pending += 1;
    else skipped += 1;
  }

  return { targetDate, candidates: projects?.length ?? 0, sent, skipped, reviewRequired, failed, pending };
}
