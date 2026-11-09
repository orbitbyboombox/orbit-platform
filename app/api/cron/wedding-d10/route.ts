import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { planD10AutoEmails } from "@/features/accounts-receivable/d10-auto-policy";
import { summarizeD10Invoices } from "@/features/accounts-receivable/d10-invoice-summary";
import { buildCollectionEmailDraft, buildCollectionEmailHtml } from "@/features/accounts-receivable/collection-email.template";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { resolveCollectionEventDetail } from "@/features/accounts-receivable/collection-event-detail";
import { buildEventReadyEmail } from "@/features/accounts-receivable/event-ready-email.template";
import { deliverClaimedD10 } from "@/features/accounts-receivable/d10-delivery";

// Supabase relation payloads are runtime-shaped joins; all properties used below are narrowed at access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type MessageType = "COLLECTION_D10" | "EVENT_READY_D10";
const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const chileDate = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const clock = (value: string | null | undefined) => {
  if (!value) return null;
  const match = /(?:T|^)(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
};
const deliveryKey = (projectId: string, type: MessageType, eventDate: string) => `d10:${projectId}:${type}:${eventDate}`;

/** Daily Santiago D-10 delivery. Each email is durably claimed before Gmail is called;
 * QUEUED/SENT/FAILED records all suppress automatic retries and duplicates. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const targetDate = new Date(`${today}T12:00:00Z`);
  targetDate.setUTCDate(targetDate.getUTCDate() + 10);
  const eventDate = targetDate.toISOString().slice(0, 10);
  const admin = createAdminClient();
  // Query events first: an event with no invoice still receives "Todo listo".
  const { data: events, error } = await admin.from("projects")
    .select("id,customer_id,name,project_type,event_date,event_time,status,location,city,operations,deleted_at,customers(full_name,email,secondary_email),project_services(service_code,duration_hours),project_operational_contracts(service_start_at,service_end_at)")
    .eq("event_date", eventDate).eq("status", "CONFIRMED").is("deleted_at", null).limit(1000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if ((events ?? []).length === 1000) return NextResponse.json({ ok: false, error: "D-10 event batch limit reached" }, { status: 503 });
  const company = await loadCompanySettings(admin);
  const bankDetails = resolveCollectionBankDetails(company);
  const grouped = new Map<string, { project: Row; customer: Row }>();
  for (const project of (events ?? []) as Row[]) {
    const customer = first<Row>(project.customers);
    if (project.id && customer) grouped.set(project.id, { project, customer });
  }
  const ids = [...grouped.keys()];
  const invoiceRows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const subset = ids.slice(offset, offset + 100);
    for (let page = 0; page < 100; page++) {
      const { data: batch, error: invoiceError } = await admin.from("accounts_receivable_projection")
        .select("id,invoice_number,customer_id,project_id,status,effective_status,amount,paid_amount,outstanding_balance,due_date,days_remaining,currency,deleted_at,archived_at,cancelled_at")
        .in("project_id", subset).order("id", { ascending: true }).range(page * 500, page * 500 + 499);
      if (invoiceError) return NextResponse.json({ ok: false, error: invoiceError.message }, { status: 500 });
      invoiceRows.push(...(batch ?? []));
      if ((batch ?? []).length < 500) break;
      if (page === 99) return NextResponse.json({ ok: false, error: "D-10 invoice batch limit reached" }, { status: 503 });
    }
  }
  const invoicesByProject = new Map<string, Row[]>();
  for (const invoice of invoiceRows) {
    if (!invoice.project_id || invoice.deleted_at || invoice.archived_at || invoice.cancelled_at ||
        ["CANCELLED", "ARCHIVED", "DELETED", "VOID"].includes(String(invoice.status ?? "").toUpperCase())) continue;
    const existing = invoicesByProject.get(invoice.project_id) ?? [];
    existing.push(invoice);
    invoicesByProject.set(invoice.project_id, existing);
  }
  // Read the entire D-10 history before dispatch. The PostgREST default
  // row limit may otherwise hide a prior send and cause a duplicate.
  const history: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const subset = ids.slice(offset, offset + 100);
    for (let page = 0; page < 100; page++) {
      const { data: batch, error: historyError } = await admin.from("communications")
        .select("id,project_id,communication_type,status,request_key,thread_key,occurred_at")
        .in("project_id", subset)
        .in("communication_type", ["COLLECTION_D10", "EVENT_READY_D10", "COLLECTION_EMAIL"])
        .order("id", { ascending: true }).range(page * 500, page * 500 + 499);
      if (historyError) return NextResponse.json({ ok: false, error: historyError.message }, { status: 500 });
      history.push(...(batch ?? []));
      if ((batch ?? []).length < 500) break;
      if (page === 99) return NextResponse.json({ ok: false, error: "D-10 history batch limit reached" }, { status: 503 });
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let sender: GoogleGmailApiProvider | null = null;
  for (const [projectId, { project, customer }] of grouped) {
    const financial = summarizeD10Invoices(invoicesByProject.get(projectId) ?? []);
    const { invoices, amount, paidAmount, representative: invoice } = financial;
    const balance = financial.outstandingBalance;
    const balanceValid = financial.valid;
    const singleCurrency = financial.valid;
    const operational = first<Row>(project.project_operational_contracts);
    const services = (project.project_services ?? []) as Row[];
    const details = resolveCollectionEventDetail({
      eventDate: project.event_date, location: project.location, city: project.city, operations: project.operations,
      services: services.map((item) => ({ serviceCode: item.service_code, durationHours: Number(item.duration_hours ?? 0) || null })),
      operationalContract: operational ? { serviceStartAt: operational.service_start_at, serviceEndAt: operational.service_end_at } : null,
    });
    const start = clock(operational?.service_start_at) ?? clock(project.event_time);
    const end = clock(operational?.service_end_at);
    const eventTime = start ? `${start}${end ? ` a ${end}` : ""}` : "";
    const readyDetailsComplete = Boolean(details.eventDate && details.eventLocation && details.service && eventTime && details.eventDuration);
    const comms = history.filter((item) => item.project_id === projectId).flatMap((item) => {
      const sameDayManualCollection = item.communication_type === "COLLECTION_EMAIL" && item.status === "SENT" && item.occurred_at && chileDate(item.occurred_at) === today;
      if (item.communication_type === "COLLECTION_EMAIL" && !sameDayManualCollection) return [];
      return [{
      projectId,
      type: item.communication_type === "COLLECTION_EMAIL" || item.communication_type === "COLLECTION_D10" ? "COLLECTION_D10" as const : "EVENT_READY_D10" as const,
      status: item.status as "QUEUED" | "PENDING" | "SENT" | "FAILED",
      }];
    });
    const ready = planD10AutoEmails({ projectId, projectType: project.project_type ?? "", eventDate: project.event_date,
      status: project.status ?? "", outstandingBalance: balanceValid && singleCurrency ? balance : 0, customerEmail: customer.email ?? null,
      confirmed: String(project.status).toUpperCase() === "CONFIRMED", readyDetailsComplete,
    }, today, comms);

    const tasks: Array<{ type: MessageType; to: string; cc: string[]; subject: string; textBody: string; htmlBody: string }> = [];
    if (ready.eventReady) {
      const template = buildEventReadyEmail({ customerName: customer.full_name ?? "Cliente", eventDate: dateLabel(details.eventDate!),
        eventLocation: details.eventLocation!, service: details.service!, eventTime, eventDuration: details.eventDuration!, website: company.website });
      tasks.push({ type: "EVENT_READY_D10", to: customer.email, cc: [], subject: template.subject, textBody: `${template.subject}\n${dateLabel(details.eventDate!)} · ${details.eventLocation} · ${eventTime} · ${details.service} · ${details.eventDuration}\n\nConfirmar horario del servicio\nConfirmar diseño`, htmlBody: template.html });
    }
    const bankConfigured = !/no configurad|sin (?:número|rut)/i.test(`${bankDetails.bankName} ${bankDetails.accountNumber} ${bankDetails.rut}`);
    if (ready.collection && invoice && balanceValid && singleCurrency && balance > 0 && bankConfigured) {
      const draft = buildCollectionEmailDraft({ invoiceNumber: invoice.invoice_number, customerName: customer.full_name ?? "Cliente",
        customerEmail: customer.email ?? null, customerSecondaryEmail: customer.secondary_email ?? null,
        projectName: project.name ?? "BOOMBOX", amount, outstandingBalance: balance,
        dueDate: invoice.due_date, daysRemaining: invoice.days_remaining, status: invoice.status as "PENDING",
        eventDate: details.eventDate, eventLocation: details.eventLocation, service: details.service,
        eventDuration: details.eventDuration, collectionActions: [] }, bankDetails);
      tasks.push({ type: "COLLECTION_D10", to: draft.to, cc: draft.cc, subject: draft.subject, textBody: draft.body, htmlBody: buildCollectionEmailHtml(draft) });
    }

    for (const task of tasks) {
      const key = deliveryKey(projectId, task.type, eventDate);
      const queuedAt = new Date().toISOString();
      if (!sender) sender = new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
      let claimId: string | null = null;
      const outcome = await deliverClaimedD10({
        claim: async () => {
          const { data: claim, error: claimError } = await admin.from("communications").insert({
            customer_id: project.customer_id, project_id: projectId, channel: "GMAIL", direction: "OUTBOUND",
            communication_type: task.type, request_key: key, thread_key: key, subject: task.subject, body: task.textBody,
            status: "QUEUED", occurred_at: queuedAt, to_recipient: task.to, cc_recipients: task.cc,
            context_snapshot: { eventDate, outstandingBalance: balance, paidAmount, invoiceIds: invoices.map(item => item.id) },
          }).select("id").single();
          if (claimError?.code === "23505") return false;
          if (claimError || !claim) throw claimError ?? new Error("D-10 claim insert returned no record");
          claimId = claim.id;
          return true;
        },
        sendOnce: () => sender!.sendOnce({ to: task.to, cc: task.cc, idempotencyKey: key, subject: task.subject,
          textBody: task.textBody, htmlBody: task.htmlBody, driveFileIds: [] }),
        markSent: async (delivery) => {
          const update = await admin.from("communications").update({ status: "SENT", external_message_id: delivery.messageId,
            thread_key: delivery.threadId, sent_at: new Date().toISOString(), failure_reason: null }).eq("id", claimId);
          if (update.error) console.error("d10.history_pending_after_gmail_accept", { projectId, communicationId: claimId, messageId: delivery.messageId });
        },
        markFailed: async (sendError) => {
          const update = await admin.from("communications").update({ status: "FAILED", failure_reason: sendError instanceof Error ? sendError.message.slice(0, 2000) : "Gmail delivery failed" }).eq("id", claimId);
          if (update.error) console.error("d10.failure_history_pending", { projectId, communicationId: claimId, error: update.error.message });
        },
      }).catch((claimError) => {
        console.error("d10.claim_failed", { projectId, type: task.type, error: claimError instanceof Error ? claimError.message : String(claimError) });
        return "FAILED" as const;
      });
      if (outcome === "SENT") sent++;
      else if (outcome === "SKIPPED") skipped++;
      else failed++;
    }
  }
  return NextResponse.json({ ok: failed === 0, mode: "AUTOMATIC_D10", eventDate, sent, skipped, failed });
}
