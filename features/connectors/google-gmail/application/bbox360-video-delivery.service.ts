import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, type GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { BBOX360_VIDEO_SUBJECT, bbox360VideoDeliveryText, renderBbox360VideoDeliveryHtml, validateBbox360VideoDeliveryUrl } from "./bbox360-video-delivery.template";

export type Bbox360VideoDeliveryStatus = "PENDING" | "SENT" | "FAILED";
export type Bbox360VideoDeliveryHistoryItem = { id: string; status: string; to: string; cc: string[]; sentAt: string; providerMessageId: string | null; failureReason: string | null; videoUrl: string; isResend: boolean };
export type Bbox360VideoDeliveryComposer = { projectId: string; eligible: true; orbitEventId: string; customerId: string; customerName: string; eventDate: string; to: string; cc: string[]; subject: string; currentVideoUrl: string; previewHtml: string | null; hasSuccessfulSend: boolean; lastSentAt: string | null; status: Bbox360VideoDeliveryStatus; history: Bbox360VideoDeliveryHistoryItem[] } | { projectId: string; eligible: false; reason: "NOT_ELIGIBLE" };

type CommunicationRow = { id: string; status: string; to_recipient: string | null; cc_recipients: string[] | null; occurred_at: string; sent_at: string | null; external_message_id: string | null; failure_reason: string | null; original_communication_id: string | null; delivery_reference: string | null };
const communicationType = "BBOX360_VIDEO_DELIVERY";
const requestKey = (projectId: string, attemptId: string) => `bbox360-video-delivery:${projectId}:${attemptId}`;
const status = (history: CommunicationRow[]): Bbox360VideoDeliveryStatus => !history.length ? "PENDING" : history[0]?.status === "SENT" ? "SENT" : history[0]?.status === "FAILED" ? "FAILED" : "PENDING";

export async function loadBbox360VideoDeliveryComposer(projectId: string): Promise<Bbox360VideoDeliveryComposer> {
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: rows, error: historyError }] = await Promise.all([
    admin.from("projects").select("id,customer_id,orbit_event_id,event_date,bbox360_video_delivery_url,customers!inner(full_name,email,secondary_email)").eq("id", projectId).is("deleted_at", null).single(),
    admin.from("communications").select("id,status,to_recipient,cc_recipients,occurred_at,sent_at,external_message_id,failure_reason,original_communication_id,delivery_reference").eq("project_id", projectId).eq("communication_type", communicationType).order("occurred_at", { ascending: false }),
  ]);
  if (projectError) throw projectError;
  if (historyError) throw historyError;
  // Available for every event, independently of contracted services.
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  if (!customer?.email) throw new Error("El cliente no tiene correo principal registrado.");
  if (!project.event_date) throw new Error("El Evento no tiene una fecha canónica registrada.");
  const history = (rows ?? []) as CommunicationRow[];
  const currentVideoUrl = String(project.bbox360_video_delivery_url ?? "");
  const lastSuccessful = history.find((item) => item.status === "SENT");
  return { projectId, eligible: true, orbitEventId: project.orbit_event_id, customerId: project.customer_id, customerName: customer.full_name || "Cliente", eventDate: project.event_date, to: customer.email, cc: customer.secondary_email ? [customer.secondary_email] : [], subject: BBOX360_VIDEO_SUBJECT, currentVideoUrl, previewHtml: currentVideoUrl ? renderBbox360VideoDeliveryHtml(customer.full_name || "Cliente", project.event_date, currentVideoUrl) : null, hasSuccessfulSend: Boolean(lastSuccessful), lastSentAt: lastSuccessful?.sent_at ?? lastSuccessful?.occurred_at ?? null, status: status(history), history: history.map((item) => ({ id: item.id, status: item.status, to: item.to_recipient ?? customer.email, cc: item.cc_recipients ?? [], sentAt: item.sent_at ?? item.occurred_at, providerMessageId: item.external_message_id, failureReason: item.failure_reason, videoUrl: item.delivery_reference ?? "", isResend: Boolean(item.original_communication_id) })) };
}

export async function saveBbox360VideoDeliveryUrl(input: { projectId: string; actorId: string; videoUrl: string }) {
  const videoUrl = validateBbox360VideoDeliveryUrl(input.videoUrl);
  const composer = await loadBbox360VideoDeliveryComposer(input.projectId);
  if (!composer.eligible) throw new Error("No fue posible habilitar la entrega de videos BBOX 360.");
  const admin = createAdminClient();
  const { error } = await admin.from("projects").update({ bbox360_video_delivery_url: videoUrl, bbox360_video_delivery_updated_at: new Date().toISOString(), bbox360_video_delivery_updated_by: input.actorId }).eq("id", input.projectId).is("deleted_at", null).select("id").single();
  if (error) throw error;
  return loadBbox360VideoDeliveryComposer(input.projectId);
}

export type SendBbox360VideoDeliveryInput = { projectId: string; actorId: string; requestId: string; videoUrl: string; cc?: string | readonly string[] | null; confirmResend?: boolean; sender?: GoogleGmailLiveProvider };
export type SendBbox360VideoDeliveryResult = { status: "SENT" | "FAILED" | "PENDING"; recipient: string; ccRecipients: string[]; sentAt: string; communicationId: string; providerMessageId: string | null; deduplicated: boolean };

export async function sendBbox360VideoDelivery(input: SendBbox360VideoDeliveryInput): Promise<SendBbox360VideoDeliveryResult> {
  const attemptId = input.requestId.trim();
  if (!attemptId) throw new Error("El envío requiere un identificador de intento.");
  const videoUrl = validateBbox360VideoDeliveryUrl(input.videoUrl);
  let composer = await loadBbox360VideoDeliveryComposer(input.projectId);
  if (!composer.eligible) throw new Error("No fue posible habilitar la entrega de videos BBOX 360.");
  if (composer.currentVideoUrl !== videoUrl) { const saved = await saveBbox360VideoDeliveryUrl({ projectId: input.projectId, actorId: input.actorId, videoUrl }); if (!saved.eligible) throw new Error("No fue posible habilitar la entrega de videos BBOX 360."); composer = saved; }
  const recipients = normalizeEmailRecipients({ to: composer.to, cc: input.cc ?? composer.cc });
  const key = requestKey(input.projectId, attemptId);
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("communications").select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id").eq("project_id", input.projectId).eq("communication_type", communicationType).eq("request_key", key).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { status: existing.status === "SENT" ? "SENT" : existing.status === "FAILED" ? "FAILED" : "PENDING", recipient: existing.to_recipient ?? recipients.to, ccRecipients: existing.cc_recipients ?? recipients.cc, sentAt: existing.sent_at ?? existing.occurred_at, communicationId: existing.id, providerMessageId: existing.external_message_id, deduplicated: true };
  if (composer.hasSuccessfulSend && !input.confirmResend) throw new Error(`¿Enviar nuevamente los videos BBOX 360 a ${composer.to}?`);
  const firstSuccessful = composer.history.filter((item) => item.status === "SENT").at(-1);
  const queuedAt = new Date().toISOString();
  const { data: communication, error: insertError } = await admin.from("communications").insert({ customer_id: composer.customerId, project_id: input.projectId, channel: "GMAIL", direction: "OUTBOUND", communication_type: communicationType, thread_key: key, request_key: key, subject: BBOX360_VIDEO_SUBJECT, body: bbox360VideoDeliveryText(composer.customerName, composer.eventDate, videoUrl), status: "QUEUED", to_recipient: recipients.to, cc_recipients: recipients.cc, occurred_at: queuedAt, created_by: input.actorId, sent_by: input.actorId, original_communication_id: firstSuccessful?.id ?? null, delivery_reference: videoUrl }).select("id").single();
  if (insertError) { if (insertError.code === "23505") { const duplicate = await admin.from("communications").select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id").eq("project_id", input.projectId).eq("communication_type", communicationType).eq("request_key", key).single(); if (duplicate.error) throw duplicate.error; return { status: duplicate.data.status === "SENT" ? "SENT" : duplicate.data.status === "FAILED" ? "FAILED" : "PENDING", recipient: duplicate.data.to_recipient ?? recipients.to, ccRecipients: duplicate.data.cc_recipients ?? recipients.cc, sentAt: duplicate.data.sent_at ?? duplicate.data.occurred_at, communicationId: duplicate.data.id, providerMessageId: duplicate.data.external_message_id, deduplicated: true }; } throw insertError; }
  try {
    const sender = input.sender ?? new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const delivered = await sender.send({ to: recipients.to, cc: recipients.cc, idempotencyKey: key, subject: BBOX360_VIDEO_SUBJECT, textBody: bbox360VideoDeliveryText(composer.customerName, composer.eventDate, videoUrl), htmlBody: renderBbox360VideoDeliveryHtml(composer.customerName, composer.eventDate, videoUrl), driveFileIds: [] });
    const sentAt = new Date().toISOString();
    const update = await admin.from("communications").update({ status: "SENT", external_message_id: delivered.messageId, thread_key: delivered.threadId, sent_at: sentAt, occurred_at: sentAt, failure_reason: null }).eq("id", communication.id);
    if (update.error) return { status: "PENDING", recipient: recipients.to, ccRecipients: recipients.cc, sentAt, communicationId: communication.id, providerMessageId: delivered.messageId, deduplicated: false };
    await admin.from("timeline_events").upsert({ customer_id: composer.customerId, project_id: input.projectId, orbit_event_id: composer.orbitEventId, communication_id: communication.id, event_type: "BBOX360_VIDEO_DELIVERY_SENT", title: "VIDEOS BBOX 360 ENVIADOS", description: `Enviado a: ${recipients.to}`, actor_id: input.actorId, actor_label: "Founder", source: "Gmail", action: "BBOX360_VIDEO_DELIVERY_SENT", entity_type: "Communication", entity_id: communication.id, human_message: `VIDEOS BBOX 360 ENVIADOS · Enviado a: ${recipients.to}`, correlation_id: `bbox360-video-delivery:${communication.id}`, created_by: input.actorId }, { onConflict: "correlation_id", ignoreDuplicates: true });
    return { status: "SENT", recipient: recipients.to, ccRecipients: recipients.cc, sentAt, communicationId: communication.id, providerMessageId: delivered.messageId, deduplicated: false };
  } catch (error) {
    await admin.from("communications").update({ status: "FAILED", failure_reason: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000), occurred_at: new Date().toISOString() }).eq("id", communication.id);
    throw error;
  }
}
