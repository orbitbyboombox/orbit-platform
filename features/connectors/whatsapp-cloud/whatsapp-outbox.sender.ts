import { createAdminClient } from "@/lib/supabase/admin";
import {
  MetaWhatsAppRejectedError,
  sendMetaWhatsAppText,
  whatsappDeliveryEnabled,
} from "./meta-whatsapp-cloud";

interface OutboxRow {
  id: string;
  correlation_id: string;
  conversation_id: string;
  customer_id: string;
  recipient_wa_id: string;
  text_body: string;
  status: string;
  attempt_count: number;
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
    .select("id,correlation_id,conversation_id,customer_id,recipient_wa_id,text_body,status,attempt_count")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { ok: true as const, skipped: true as const };

  const row = claimed as OutboxRow;
  try {
    const sent = await sendMetaWhatsAppText(row.recipient_wa_id, row.text_body);
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
    const detail = error instanceof Error ? error.message : String(error);
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
