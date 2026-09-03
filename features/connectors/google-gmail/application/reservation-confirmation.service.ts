import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import { buildReservationConfirmationTemplate } from "./reservation-confirmation.template";
import {
  customerCommercialItemsFromLegacyQuote,
  customerCommercialItemsFromSnapshot,
} from "@/features/projects/reservation-presentation";
import {
  loadReservationCommercialDocument,
  reservationCommercialDocumentFilename,
} from "@/features/commercial-hub/formal-quote-document";
import { renderReservationConfirmationDelivery } from "./reservation-confirmation.html";

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
  commercialDocumentReference: string | null;
  portalDestinationType: string | null;
};

export type ReservationConfirmationComposer = {
  projectId: string;
  orbitEventId: string;
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
  companyCommercial: boolean;
  quotationId: string | null;
  quotationNumber: string | null;
  attachmentFilename: string | null;
  portalCtaAvailable: boolean;
  portalUrl: string | null;
  website: string;
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
  commercial_document_reference: string | null;
  portal_destination_type: string | null;
};

const portalLoginUrl = () => {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";
  return `${origin.replace(/\/$/, "")}/portal`;
};

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
  const [{ data: project, error: projectError }, { data: rows, error: historyError }, company] =
    await Promise.all([
      admin
        .from("projects")
        .select(
          "id,customer_id,orbit_event_id,name,project_type,event_date,event_time,location,city,operations,customers!inner(full_name,email,secondary_email,metadata),project_services(service_code,duration_hours),quotations(id,status,quotation_number,customer_type,final_customer_price,grand_total,transport_total,accepted_snapshot,created_at,quotation_items(label,description,total)),agreements(id,signed_pdf_path,created_at),financial_event_records(invoiced_amount,paid_amount,outstanding_balance),project_operational_contracts(service_start_at,service_end_at),customer_portal_tokens(id)",
        )
        .eq("id", projectId)
        .is("deleted_at", null)
        .single(),
      admin
        .from("communications")
        .select(
          "id,status,to_recipient,cc_recipients,subject,occurred_at,sent_at,external_message_id,failure_reason,original_communication_id,commercial_document_reference,portal_destination_type",
        )
        .eq("project_id", projectId)
        .eq("communication_type", "RESERVATION_CONFIRMATION")
        .order("occurred_at", { ascending: false }),
      loadCompanySettings(admin),
    ]);
  if (projectError) throw projectError;
  if (historyError) throw historyError;
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  if (!customer?.email) throw new Error("El cliente no tiene correo principal registrado.");
  const quotations = [...(project.quotations ?? [])].sort((a, b) => {
    const acceptedOrder = Number(b.status === "ACCEPTED") - Number(a.status === "ACCEPTED");
    return acceptedOrder || String(b.created_at).localeCompare(String(a.created_at));
  });
  const quotation = quotations[0];
  const financial = Array.isArray(project.financial_event_records)
    ? project.financial_event_records[0]
    : project.financial_event_records;
  if (!financial) {
    throw new Error(
      "No existe verdad financiera canónica para preparar la confirmación.",
    );
  }
  const total = Number(financial.invoiced_amount);
  const paid = Number(financial.paid_amount);
  const balance = Number(financial.outstanding_balance);
  if (
    ![total, paid, balance].every(Number.isFinite) ||
    total < 0 ||
    paid < 0 ||
    balance < 0 ||
    Math.abs(total - paid - balance) > 1
  ) {
    throw new Error(
      "La verdad financiera canónica no es consistente para enviar la confirmación.",
    );
  }
  const companyCommercial =
    quotation?.customer_type === "COMPANY" ||
    /CORPORATE|EMPRESA/i.test(String(project.project_type ?? ""));
  const operational = Array.isArray(project.project_operational_contracts)
    ? project.project_operational_contracts[0]
    : project.project_operational_contracts;
  const operations = object(project.operations);
  const origin = object(operations.commercialOrigin);
  const originEvent = object(origin.event);
  const acceptedItems = customerCommercialItemsFromSnapshot(
    quotation?.accepted_snapshot,
  );
  const commercialItems = acceptedItems.length
    ? acceptedItems
    : customerCommercialItemsFromLegacyQuote(quotation?.quotation_items ?? []);
  const formalAgreement = [...(project.agreements ?? [])]
    .filter((item) => Boolean(item.signed_pdf_path))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const template = buildReservationConfirmationTemplate({
    customer: { fullName: customer.full_name, metadata: customer.metadata },
    eventName: String(originEvent.name ?? project.name ?? "tu evento"),
    eventDate: project.event_date,
    eventTime: project.event_time,
    venue: project.location,
    city: project.city,
    serviceCodes: (project.project_services ?? []).map((item) => item.service_code),
    commercialItems,
    serviceStartAt: operational?.service_start_at,
    serviceEndAt: operational?.service_end_at,
    eventDurationHours: Number(operations.durationHours ?? 0) || null,
    serviceDurations: (project.project_services ?? []).map((item) => Number(item.duration_hours ?? 0)),
    transport: Number(quotation?.transport_total ?? 0),
    total,
    paid,
    balance,
    portalAvailable: (project.customer_portal_tokens ?? []).length > 0,
    companyCommercial,
  });
  const history = (rows ?? []) as CommunicationRow[];
  return {
    projectId,
    orbitEventId: project.orbit_event_id,
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
    total,
    paid,
    balance,
    companyCommercial,
    quotationId: quotation?.id ?? null,
    quotationNumber: quotation?.quotation_number ?? null,
    attachmentFilename:
      companyCommercial && quotation?.quotation_number
        ? reservationCommercialDocumentFilename(
            String(quotation.quotation_number),
            Boolean(formalAgreement),
          )
        : null,
    portalCtaAvailable: (project.customer_portal_tokens ?? []).length > 0,
    portalUrl:
      (project.customer_portal_tokens ?? []).length > 0 ? portalLoginUrl() : null,
    website: company.website,
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
      commercialDocumentReference: item.commercial_document_reference,
      portalDestinationType: item.portal_destination_type,
    })),
  };
}

export type SendReservationConfirmationInput = {
  projectId: string;
  actorId: string;
  requestId: string;
  to?: string;
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
  const recipients = normalizeEmailRecipients({ to: input.to ?? composer.to, cc: input.cc ?? composer.cc });
  const subject = String(input.subject ?? composer.subject).trim().slice(0, 240);
  const body = String(input.body ?? composer.body).trim().slice(0, 20_000);
  if (!subject || !body) throw new Error("Asunto y mensaje son obligatorios.");
  const rendered = renderReservationConfirmationDelivery({
    body,
    website: composer.website,
    companyCommercial: composer.companyCommercial,
    portalCtaAvailable: composer.portalCtaAvailable,
    portalUrl: composer.portalUrl,
  });
  const portalCtaRequested = Boolean(rendered.portalUrl);
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
    throw new Error(`¿Enviar nuevamente la confirmación a ${recipients.to}?`);
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
      commercial_document_reference: composer.attachmentFilename,
      portal_destination_type: portalCtaRequested
        ? "CUSTOMER_PORTAL_LOGIN"
        : null,
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
    const sender = input.sender ?? new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const portalUrl = rendered.portalUrl;
    const document = composer.companyCommercial && composer.quotationId && composer.quotationNumber
      ? await loadReservationCommercialDocument(admin, {
          projectId: input.projectId,
          quotationId: composer.quotationId,
          quotationNumber: composer.quotationNumber,
        })
      : null;
    if (composer.companyCommercial && !document)
      throw new Error("No existe un documento comercial formal para adjuntar.");
    const textBody = portalUrl
      ? body.replace("ABRIR EVENTO EN ORBIT", `ABRIR EVENTO EN ORBIT\n${portalUrl}`)
      : body;
    const delivered = await sender.send({
      to: recipients.to,
      cc: recipients.cc,
      idempotencyKey: requestKey,
      subject,
      textBody,
      htmlBody: rendered.htmlBody,
      driveFileIds: [],
      attachments: document
        ? [
            {
              filename: document.filename,
              mimeType: document.mimeType,
              content: document.bytes,
            },
          ]
        : [],
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
      orbit_event_id: composer.orbitEventId,
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
