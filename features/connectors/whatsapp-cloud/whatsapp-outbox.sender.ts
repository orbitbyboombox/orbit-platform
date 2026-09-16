import { createAdminClient } from "@/lib/supabase/admin";
import {
  MetaWhatsAppRejectedError,
  sendMetaWhatsAppTemplate,
  sendMetaWhatsAppText,
  whatsappDeliveryEnabled,
} from "./meta-whatsapp-cloud";
import type { MetaWhatsAppStatusEvent } from "./meta-whatsapp-cloud";
import { serializeWhatsAppError } from "./whatsapp-observability";
import { WHATSAPP_TENANT_SLUG } from "./whatsapp-tenant";

interface OutboxRow {
  id: string;
  correlation_id: string;
  conversation_id: string;
  customer_id: string;
  recipient_wa_id: string;
  text_body: string;
  status: string;
  attempt_count: number;
  message_mode: "TEXT" | "TEMPLATE";
  template_name: string | null;
  template_language: string | null;
  template_parameters: string[];
  service_window_expires_at: string | null;
}

export async function deliverWhatsAppOutboxMessage(correlationId: string) {
  if (!whatsappDeliveryEnabled()) return { ok: true as const, disabled: true as const };

  const client = createAdminClient();
  const { data: claimed, error: claimError } = await client
    .from("whatsapp_outbound_messages")
    .update({
      status: "SENDING",
      attempt_count: 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("correlation_id", correlationId)
    .eq("status", "PENDING")
    .select("id,correlation_id,conversation_id,customer_id,recipient_wa_id,text_body,status,attempt_count,message_mode,template_name,template_language,template_parameters,service_window_expires_at")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { ok: true as const, skipped: true as const };

  const row = claimed as OutboxRow;
  const windowExpiresAt = row.service_window_expires_at ? new Date(row.service_window_expires_at).getTime() : NaN;
  if (row.message_mode === "TEXT" && (!Number.isFinite(windowExpiresAt) || windowExpiresAt <= Date.now())) {
    await client.from("whatsapp_outbound_messages").update({
      status: "BLOCKED_WINDOW",
      last_error: "WhatsApp customer-service window is closed or missing.",
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "SENDING");
    await client.from("communications").update({ status: "BLOCKED_WINDOW" })
      .eq("thread_key", row.conversation_id)
      .eq("direction", "OUTBOUND")
      .eq("external_message_id", row.correlation_id);
    return { ok: false as const, blockedWindow: true as const };
  }
  try {
    const sent = row.message_mode === "TEMPLATE"
      ? await sendMetaWhatsAppTemplate({
        to: row.recipient_wa_id,
        name: row.template_name ?? "",
        language: row.template_language ?? "es_CL",
        parameters: row.template_parameters,
      })
      : await sendMetaWhatsAppText(row.recipient_wa_id, row.text_body);
    const sentAt = new Date().toISOString();
    const { error } = await client.from("whatsapp_outbound_messages").update({
      status: "SENT",
      provider_message_id: sent.providerMessageId,
      sent_at: sentAt,
      last_error: null,
      updated_at: sentAt,
    }).eq("id", row.id).eq("status", "SENDING");
    if (error) throw error;

    await client.from("communications").update({
      status: "SENT",
      external_message_id: sent.providerMessageId ?? correlationId,
    }).eq("thread_key", row.conversation_id)
      .eq("direction", "OUTBOUND")
      .eq("external_message_id", correlationId);

    return { ok: true as const, sent: true as const, providerMessageId: sent.providerMessageId };
  } catch (error) {
    const detail = serializeWhatsAppError(error);
    const safelyRejected = error instanceof MetaWhatsAppRejectedError;
    await client.from("whatsapp_outbound_messages").update({
      status: safelyRejected ? "FAILED" : "AMBIGUOUS",
      last_error: detail.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "SENDING");
    console.error("whatsapp.outbox.delivery_failed", {
      correlationId,
      status: safelyRejected ? "FAILED" : "AMBIGUOUS",
      detail,
    });
    return { ok: false as const, error: detail, ambiguous: !safelyRejected };
  }
}

export async function updateWhatsAppOutboxStatus(event: Pick<MetaWhatsAppStatusEvent, "providerMessageId" | "status" | "statusCode" | "statusMessage">) {
  const client = createAdminClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    provider_status: event.status,
    updated_at: now,
  };
  if (event.status === "delivered") patch.delivered_at = now;
  if (event.status === "read") patch.read_at = now;
  if (event.status === "failed") {
    patch.status = "FAILED";
    patch.failed_at = now;
    patch.provider_error_code = event.statusCode ?? null;
    patch.provider_error_message = event.statusMessage ?? null;
    patch.last_error = event.statusMessage ?? event.statusCode ?? "Meta delivery failed.";
  }
  const { data, error } = await client.from("whatsapp_outbound_messages")
    .update(patch)
    .eq("tenant_slug", WHATSAPP_TENANT_SLUG)
    .eq("provider_message_id", event.providerMessageId)
    .select("conversation_id,correlation_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: true as const, matched: false as const };
  await client.from("communications").update({
    status: event.status === "failed" ? "FAILED" : event.status.toUpperCase(),
  }).eq("thread_key", data.conversation_id)
    .eq("direction", "OUTBOUND")
    .eq("external_message_id", data.correlation_id);
  return { ok: true as const, matched: true as const };
}
