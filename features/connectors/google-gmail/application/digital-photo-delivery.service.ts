import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import {
  DIGITAL_PHOTO_SUBJECT,
  digitalPhotoDeliveryText,
  renderDigitalPhotoDeliveryHtml,
  validateDigitalPhotoDeliveryUrl,
} from "./digital-photo-delivery.template";

export type DigitalPhotoDeliveryStatus = "PENDING" | "SENT" | "FAILED";

export type DigitalPhotoDeliveryHistoryItem = {
  id: string;
  status: string;
  to: string;
  cc: string[];
  sentAt: string;
  providerMessageId: string | null;
  failureReason: string | null;
  photoUrl: string;
  isResend: boolean;
};

export type DigitalPhotoDeliveryComposer = {
  projectId: string;
  orbitEventId: string;
  customerId: string;
  customerName: string;
  eventDate: string;
  to: string;
  cc: string[];
  subject: string;
  currentPhotoUrl: string;
  previewHtml: string | null;
  hasSuccessfulSend: boolean;
  lastSentAt: string | null;
  status: DigitalPhotoDeliveryStatus;
  history: DigitalPhotoDeliveryHistoryItem[];
};

type CommunicationRow = {
  id: string;
  status: string;
  to_recipient: string | null;
  cc_recipients: string[] | null;
  occurred_at: string;
  sent_at: string | null;
  external_message_id: string | null;
  failure_reason: string | null;
  original_communication_id: string | null;
  delivery_reference: string | null;
};

function state(history: CommunicationRow[]): DigitalPhotoDeliveryStatus {
  if (!history.length) return "PENDING";
  return history[0]?.status === "SENT"
    ? "SENT"
    : history[0]?.status === "FAILED"
      ? "FAILED"
      : "PENDING";
}

export async function loadDigitalPhotoDeliveryComposer(
  projectId: string,
): Promise<DigitalPhotoDeliveryComposer> {
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: rows, error: historyError }] =
    await Promise.all([
      admin
        .from("projects")
        .select(
          "id,customer_id,orbit_event_id,event_date,digital_photo_delivery_url,customers!inner(full_name,email,secondary_email)",
        )
        .eq("id", projectId)
        .is("deleted_at", null)
        .single(),
      admin
        .from("communications")
        .select(
          "id,status,to_recipient,cc_recipients,occurred_at,sent_at,external_message_id,failure_reason,original_communication_id,delivery_reference",
        )
        .eq("project_id", projectId)
        .eq("communication_type", "DIGITAL_PHOTO_DELIVERY")
        .order("occurred_at", { ascending: false }),
    ]);
  if (projectError) throw projectError;
  if (historyError) throw historyError;
  const customer = Array.isArray(project.customers)
    ? project.customers[0]
    : project.customers;
  if (!customer?.email)
    throw new Error("El cliente no tiene correo principal registrado.");
  if (!project.event_date)
    throw new Error("El Evento no tiene una fecha canónica registrada.");
  const history = (rows ?? []) as CommunicationRow[];
  const currentPhotoUrl = String(project.digital_photo_delivery_url ?? "");
  const lastSuccessful = history.find((item) => item.status === "SENT");
  return {
    projectId,
    orbitEventId: project.orbit_event_id,
    customerId: project.customer_id,
    customerName: customer.full_name || "Cliente",
    eventDate: project.event_date,
    to: customer.email,
    cc: customer.secondary_email ? [customer.secondary_email] : [],
    subject: DIGITAL_PHOTO_SUBJECT,
    currentPhotoUrl,
    previewHtml: currentPhotoUrl
      ? renderDigitalPhotoDeliveryHtml(
          customer.full_name || "Cliente",
          project.event_date,
          currentPhotoUrl,
        )
      : null,
    hasSuccessfulSend: Boolean(lastSuccessful),
    lastSentAt: lastSuccessful?.sent_at ?? lastSuccessful?.occurred_at ?? null,
    status: state(history),
    history: history.map((item) => ({
      id: item.id,
      status: item.status,
      to: item.to_recipient ?? customer.email,
      cc: item.cc_recipients ?? [],
      sentAt: item.sent_at ?? item.occurred_at,
      providerMessageId: item.external_message_id,
      failureReason: item.failure_reason,
      photoUrl: item.delivery_reference ?? "",
      isResend: Boolean(item.original_communication_id),
    })),
  };
}

export async function saveDigitalPhotoDeliveryUrl(input: {
  projectId: string;
  actorId: string;
  photoUrl: string;
}) {
  const photoUrl = validateDigitalPhotoDeliveryUrl(input.photoUrl);
  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .update({
      digital_photo_delivery_url: photoUrl,
      digital_photo_delivery_updated_at: new Date().toISOString(),
      digital_photo_delivery_updated_by: input.actorId,
    })
    .eq("id", input.projectId)
    .is("deleted_at", null)
    .select("id")
    .single();
  if (error) throw error;
  return loadDigitalPhotoDeliveryComposer(input.projectId);
}

export type SendDigitalPhotoDeliveryInput = {
  projectId: string;
  actorId: string;
  requestId: string;
  photoUrl: string;
  cc?: string | readonly string[] | null;
  confirmResend?: boolean;
  sender?: GoogleGmailLiveProvider;
};

export type SendDigitalPhotoDeliveryResult = {
  status: "SENT" | "FAILED" | "PENDING";
  recipient: string;
  ccRecipients: string[];
  sentAt: string;
  communicationId: string;
  providerMessageId: string | null;
  deduplicated: boolean;
};

const requestKey = (projectId: string, attemptId: string) =>
  `digital-photo-delivery:${projectId}:${attemptId}`;

export async function sendDigitalPhotoDelivery(
  input: SendDigitalPhotoDeliveryInput,
): Promise<SendDigitalPhotoDeliveryResult> {
  const attemptId = input.requestId.trim();
  if (!attemptId) throw new Error("El envío requiere un identificador de intento.");
  const photoUrl = validateDigitalPhotoDeliveryUrl(input.photoUrl);
  let composer = await loadDigitalPhotoDeliveryComposer(input.projectId);
  if (composer.currentPhotoUrl !== photoUrl) {
    composer = await saveDigitalPhotoDeliveryUrl({
      projectId: input.projectId,
      actorId: input.actorId,
      photoUrl,
    });
  }
  const recipients = normalizeEmailRecipients({
    to: composer.to,
    cc: input.cc ?? composer.cc,
  });
  const key = requestKey(input.projectId, attemptId);
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("communications")
    .select(
      "id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id",
    )
    .eq("project_id", input.projectId)
    .eq("communication_type", "DIGITAL_PHOTO_DELIVERY")
    .eq("request_key", key)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      status:
        existing.status === "SENT"
          ? "SENT"
          : existing.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      recipient: existing.to_recipient ?? recipients.to,
      ccRecipients: existing.cc_recipients ?? recipients.cc,
      sentAt: existing.sent_at ?? existing.occurred_at,
      communicationId: existing.id,
      providerMessageId: existing.external_message_id,
      deduplicated: true,
    };
  }
  if (composer.hasSuccessfulSend && !input.confirmResend) {
    throw new Error(`¿Enviar nuevamente las fotos digitales a ${composer.to}?`);
  }
  const firstSuccessful = composer.history
    .filter((item) => item.status === "SENT")
    .at(-1);
  const body = digitalPhotoDeliveryText(
    composer.customerName,
    composer.eventDate,
    photoUrl,
  );
  const queuedAt = new Date().toISOString();
  const { data: communication, error: insertError } = await admin
    .from("communications")
    .insert({
      customer_id: composer.customerId,
      project_id: input.projectId,
      channel: "GMAIL",
      direction: "OUTBOUND",
      communication_type: "DIGITAL_PHOTO_DELIVERY",
      thread_key: key,
      request_key: key,
      subject: DIGITAL_PHOTO_SUBJECT,
      body,
      status: "QUEUED",
      to_recipient: recipients.to,
      cc_recipients: recipients.cc,
      occurred_at: queuedAt,
      created_by: input.actorId,
      sent_by: input.actorId,
      original_communication_id: firstSuccessful?.id ?? null,
      delivery_reference: photoUrl,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const duplicate = await admin
        .from("communications")
        .select(
          "id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id",
        )
        .eq("project_id", input.projectId)
        .eq("communication_type", "DIGITAL_PHOTO_DELIVERY")
        .eq("request_key", key)
        .single();
      if (duplicate.error) throw duplicate.error;
      return {
        status:
          duplicate.data.status === "SENT"
            ? "SENT"
            : duplicate.data.status === "FAILED"
              ? "FAILED"
              : "PENDING",
        recipient: duplicate.data.to_recipient ?? recipients.to,
        ccRecipients: duplicate.data.cc_recipients ?? recipients.cc,
        sentAt: duplicate.data.sent_at ?? duplicate.data.occurred_at,
        communicationId: duplicate.data.id,
        providerMessageId: duplicate.data.external_message_id,
        deduplicated: true,
      };
    }
    throw insertError;
  }

  let providerAccepted = false;
  try {
    const sender =
      input.sender ??
      new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const delivered = await sender.send({
      to: recipients.to,
      cc: recipients.cc,
      idempotencyKey: key,
      subject: DIGITAL_PHOTO_SUBJECT,
      textBody: body,
      htmlBody: renderDigitalPhotoDeliveryHtml(
        composer.customerName,
        composer.eventDate,
        photoUrl,
      ),
      driveFileIds: [],
    });
    providerAccepted = true;
    const sentAt = new Date().toISOString();
    let updateError: { message: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const update = await admin
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
      updateError = update.error;
      if (!updateError) break;
    }
    if (updateError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "digital_photo_delivery.provider_accepted_history_pending",
          projectId: input.projectId,
          communicationId: communication.id,
          error: updateError.message,
        }),
      );
      return {
        status: "PENDING",
        recipient: recipients.to,
        ccRecipients: recipients.cc,
        sentAt,
        communicationId: communication.id,
        providerMessageId: delivered.messageId,
        deduplicated: false,
      };
    }
    const { error: timelineError } = await admin.from("timeline_events").upsert(
      {
        customer_id: composer.customerId,
        project_id: input.projectId,
        orbit_event_id: composer.orbitEventId,
        communication_id: communication.id,
        event_type: "DIGITAL_PHOTO_DELIVERY_SENT",
        title: "FOTOS DIGITALES ENVIADAS",
        description: `Enviado a: ${recipients.to}`,
        actor_id: input.actorId,
        actor_label: "Founder",
        source: "Gmail",
        action: "DIGITAL_PHOTO_DELIVERY_SENT",
        entity_type: "Communication",
        entity_id: communication.id,
        human_message: `FOTOS DIGITALES ENVIADAS · Enviado a: ${recipients.to}`,
        correlation_id: `digital-photo-delivery:${communication.id}`,
        created_by: input.actorId,
      },
      { onConflict: "correlation_id", ignoreDuplicates: true },
    );
    if (timelineError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "digital_photo_delivery.timeline_failed",
          projectId: input.projectId,
          communicationId: communication.id,
          error: timelineError.message,
        }),
      );
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
    if (!providerAccepted) {
      const failureReason =
        error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
      await admin
        .from("communications")
        .update({
          status: "FAILED",
          failure_reason: failureReason,
          occurred_at: new Date().toISOString(),
        })
        .eq("id", communication.id);
    }
    throw error;
  }
}
