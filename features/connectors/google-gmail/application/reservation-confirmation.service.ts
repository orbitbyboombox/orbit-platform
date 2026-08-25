import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import { buildReservationConfirmationTemplate } from "./reservation-confirmation.template";
import { customerCommercialItemsFromSnapshot } from "@/features/projects/reservation-presentation";

export type ReservationConfirmationStatus = "NEVER_SENT" | "SENT" | "FAILED";

export type ReservationConfirmationHistoryItem = {
  id: string;
  status: string;
  to: string;
  cc: string[];
  subject: string;
  sentAt: string;
  providerMessageId: string | null;
  failureReason: string | null;
  isResend: boolean;
};

export type ReservationConfirmationComposer = {
  projectId: string;
  customerId: string;
  customerName: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  status: ReservationConfirmationStatus;
  hasSuccessfulSend: boolean;
  lastAttemptAt: string | null;
  services: string;
  duration: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  total: number;
  paid: number;
  balance: number;
  history: ReservationConfirmationHistoryItem[];
};

type CommunicationRow = {
  id: string;
  status: string;
  to_recipient: string | null;
  cc_recipients: string[] | null;
  subject: string | null;
  occurred_at: string;
  sent_at: string | null;
  external_message_id: string | null;
  failure_reason: string | null;
  original_communication_id: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

function htmlFromEditableBody(body: string, website: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 18px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
  return `<main style="margin:0;background:#f6f4ef;padding:28px 12px;font-family:Arial,sans-serif;color:#171717;line-height:1.6"><section style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #eadfce;border-radius:18px;background:#fff"><header style="background:#171717;padding:22px 28px;color:#fff"><strong style="font-size:22px;letter-spacing:.08em">BOOMBOX</strong></header><article style="padding:28px">${paragraphs}<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eee;font-size:12px;color:#666"><a href="${escapeHtml(website)}" style="color:#e67800">${escapeHtml(website)}</a></p></article></section></main>`;
}

function object(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function communicationStatus(history: CommunicationRow[]): ReservationConfirmationStatus {
  if (!history.length) return "NEVER_SENT";
  return history[0]?.status === "SENT" ? "SENT" : "FAILED";
}

export async function loadReservationConfirmationComposer(
  projectId: string,
): Promise<ReservationConfirmationComposer> {
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: rows, error: historyError }] =
    await Promise.all([
      admin
        .from("projects")
        .select(
          "id,customer_id,name,event_date,event_time,location,city,operations,customers!inner(full_name,email,secondary_email,metadata),project_services(service_code,duration_hours),quotations(final_customer_price,grand_total,transport_total,accepted_snapshot,created_at),financial_event_records(invoiced_amount,paid_amount,outstanding_balance),project_operational_contracts(service_start_at,service_end_at),customer_portal_tokens(id)",
        )
        .eq("id", projectId)
        .is("deleted_at", null)
        .single(),
      admin
        .from("communications")
        .select(
          "id,status,to_recipient,cc_recipients,subject,occurred_at,sent_at,external_message_id,failure_reason,original_communication_id",
        )
        .eq("project_id", projectId)
        .eq("communication_type", "RESERVATION_CONFIRMATION")
        .order("occurred_at", { ascending: false }),
    ]);
  if (projectError) throw projectError;
  if (historyError) throw historyError;
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  if (!customer?.email) throw new Error("El cliente no tiene correo principal registrado.");
  const quotations = [...(project.quotations ?? [])].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  const quotation = quotations[0];
  const financial = Array.isArray(project.financial_event_records)
    ? project.financial_event_records[0]
    : project.financial_event_records;
  const operational = Array.isArray(project.project_operational_contracts)
    ? project.project_operational_contracts[0]
    : project.project_operational_contracts;
  const operations = object(project.operations);
  const origin = object(operations.commercialOrigin);
  const originEvent = object(origin.event);
  const template = buildReservationConfirmationTemplate({
    customer: { fullName: customer.full_name, metadata: customer.metadata },
    eventName: String(originEvent.name ?? project.name ?? "tu evento"),
    eventDate: project.event_date,
    eventTime: project.event_time,
    venue: project.location,
    city: project.city,
    serviceCodes: (project.project_services ?? []).map((item) => item.service_code),
    commercialItems: customerCommercialItemsFromSnapshot(
      quotation?.accepted_snapshot,
    ),
    serviceStartAt: operational?.service_start_at,
    serviceEndAt: operational?.service_end_at,
    eventDurationHours: Number(operations.durationHours ?? 0) || null,
    serviceDurations: (project.project_services ?? []).map((item) => Number(item.duration_hours ?? 0)),
    transport: Number(quotation?.transport_total ?? 0),
    total: Number(quotation?.final_customer_price ?? quotation?.grand_total ?? financial?.invoiced_amount ?? 0),
    paid: Number(financial?.paid_amount ?? 0),
    balance: Number(financial?.outstanding_balance ?? quotation?.final_customer_price ?? 0),
    portalAvailable: (project.customer_portal_tokens ?? []).length > 0,
  });
  const history = (rows ?? []) as CommunicationRow[];
  return {
    projectId,
    customerId: project.customer_id,
    customerName: template.customer,
    to: customer.email,
    cc: customer.secondary_email ? [customer.secondary_email] : [],
    subject: template.subject,
    body: template.body,
    status: communicationStatus(history),
    hasSuccessfulSend: history.some((item) => item.status === "SENT"),
    lastAttemptAt: history[0]?.sent_at ?? history[0]?.occurred_at ?? null,
    services: template.services,
    duration: template.duration,
    eventDate: project.event_date,
    eventTime: project.event_time?.slice(0, 5) ?? "Por confirmar",
    venue: template.venue,
    total: Number(quotation?.final_customer_price ?? quotation?.grand_total ?? financial?.invoiced_amount ?? 0),
    paid: Number(financial?.paid_amount ?? 0),
    balance: Number(financial?.outstanding_balance ?? quotation?.final_customer_price ?? 0),
    history: history.map((item) => ({
      id: item.id,
      status: item.status,
      to: item.to_recipient ?? customer.email,
      cc: item.cc_recipients ?? [],
      subject: item.subject ?? template.subject,
      sentAt: item.sent_at ?? item.occurred_at,
      providerMessageId: item.external_message_id,
      failureReason: item.failure_reason,
      isResend: Boolean(item.original_communication_id),
    })),
  };
}

export type SendReservationConfirmationInput = {
  projectId: string;
  actorId: string;
  requestId: string;
  subject?: string;
  body?: string;
  cc?: string | readonly string[] | null;
  confirmResend?: boolean;
  sender?: GoogleGmailLiveProvider;
};

export type SendReservationConfirmationResult = {
  status: "SENT" | "FAILED" | "PENDING";
  recipient: string;
  ccRecipients: string[];
  sentAt: string;
  communicationId: string;
  providerMessageId: string | null;
  deduplicated: boolean;
};

export async function sendReservationConfirmation(
  input: SendReservationConfirmationInput,
): Promise<SendReservationConfirmationResult> {
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error("El envío requiere un identificador de intento.");
  const admin = createAdminClient();
  const composer = await loadReservationConfirmationComposer(input.projectId);
  const recipients = normalizeEmailRecipients({ to: composer.to, cc: input.cc ?? composer.cc });
  const subject = String(input.subject ?? composer.subject).trim().slice(0, 240);
  const body = String(input.body ?? composer.body).trim().slice(0, 20_000);
  if (!subject || !body) throw new Error("Asunto y mensaje son obligatorios.");
  const requestKey = `reservation-confirmation:${input.projectId}:${requestId}`;
  const { data: existing, error: existingError } = await admin
    .from("communications")
    .select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id")
    .eq("project_id", input.projectId)
    .eq("communication_type", "RESERVATION_CONFIRMATION")
    .eq("request_key", requestKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      status: existing.status === "SENT" ? "SENT" : existing.status === "FAILED" ? "FAILED" : "PENDING",
      recipient: existing.to_recipient ?? recipients.to,
      ccRecipients: existing.cc_recipients ?? recipients.cc,
      sentAt: existing.sent_at ?? existing.occurred_at,
      communicationId: existing.id,
      providerMessageId: existing.external_message_id,
      deduplicated: true,
    };
  }
  if (composer.hasSuccessfulSend && !input.confirmResend) {
    throw new Error(`¿Enviar nuevamente la confirmación a ${composer.to}?`);
  }
  const firstSuccessful = composer.history
    .filter((item) => item.status === "SENT")
    .at(-1);
  const queuedAt = new Date().toISOString();
  const { data: communication, error: insertError } = await admin
    .from("communications")
    .insert({
      customer_id: composer.customerId,
      project_id: input.projectId,
      channel: "GMAIL",
      direction: "OUTBOUND",
      communication_type: "RESERVATION_CONFIRMATION",
      thread_key: requestKey,
      request_key: requestKey,
      subject,
      body,
      status: "QUEUED",
      to_recipient: recipients.to,
      cc_recipients: recipients.cc,
      occurred_at: queuedAt,
      created_by: input.actorId,
      sent_by: input.actorId,
      original_communication_id: firstSuccessful?.id ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicate, error: duplicateError } = await admin
        .from("communications")
        .select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id")
        .eq("project_id", input.projectId)
        .eq("communication_type", "RESERVATION_CONFIRMATION")
        .eq("request_key", requestKey)
        .single();
      if (duplicateError) throw duplicateError;
      return {
        status: duplicate.status === "SENT" ? "SENT" : duplicate.status === "FAILED" ? "FAILED" : "PENDING",
        recipient: duplicate.to_recipient ?? recipients.to,
        ccRecipients: duplicate.cc_recipients ?? recipients.cc,
        sentAt: duplicate.sent_at ?? duplicate.occurred_at,
        communicationId: duplicate.id,
        providerMessageId: duplicate.external_message_id,
        deduplicated: true,
      };
    }
    throw insertError;
  }
  try {
    const company = await loadCompanySettings(admin);
    const sender = input.sender ?? new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const delivered = await sender.send({
      to: recipients.to,
      cc: recipients.cc,
      idempotencyKey: requestKey,
      subject,
      textBody: body,
      htmlBody: htmlFromEditableBody(body, company.website),
      driveFileIds: [],
    });
    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("communications")
      .update({
        status: "SENT",
        external_message_id: delivered.messageId,
        thread_key: delivered.threadId,
        sent_at: sentAt,
        occurred_at: sentAt,
        failure_reason: null,
      })
      .eq("id", communication.id);
    if (updateError) throw updateError;
    const { error: timelineError } = await admin.from("timeline_events").insert({
      customer_id: composer.customerId,
      project_id: input.projectId,
      communication_id: communication.id,
      event_type: "RESERVATION_CONFIRMATION_SENT",
      title: "Confirmación de reserva enviada al cliente",
      description: `Founder envió la confirmación a ${recipients.to}.`,
      actor_id: input.actorId,
      actor_label: "Founder",
      source: "Gmail",
      action: "RESERVATION_CONFIRMATION_SENT",
      entity_type: "Communication",
      entity_id: communication.id,
      human_message: "Confirmación de reserva enviada al cliente.",
      correlation_id: `reservation-confirmation:${communication.id}`,
      created_by: input.actorId,
    });
    if (timelineError) {
      console.error(JSON.stringify({ level: "error", event: "reservation_confirmation.timeline_failed", projectId: input.projectId, communicationId: communication.id, error: timelineError.message }));
    }
    return {
      status: "SENT",
      recipient: recipients.to,
      ccRecipients: recipients.cc,
      sentAt,
      communicationId: communication.id,
      providerMessageId: delivered.messageId,
      deduplicated: false,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
    const failedAt = new Date().toISOString();
    await admin
      .from("communications")
      .update({ status: "FAILED", failure_reason: failureReason, occurred_at: failedAt })
      .eq("id", communication.id);
    throw error;
  }
}
