import { after } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseMetaWhatsAppMessages,
  verifyMetaChallenge,
  verifyMetaWebhookSignature,
} from "@/features/connectors/whatsapp-cloud/meta-whatsapp-cloud";
import { processWhatsAppWebhookEvent } from "@/features/connectors/whatsapp-cloud/whatsapp-orbit.processor";
import { deliverWhatsAppOutboxMessage } from "@/features/connectors/whatsapp-cloud/whatsapp-outbox.sender";
import { logWhatsApp } from "@/features/connectors/whatsapp-cloud/whatsapp-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_WEBHOOK_BYTES = 1_000_000;

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const challenge = verifyMetaChallenge(new URL(request.url));
    if (!challenge) {
      logWhatsApp("warn", "whatsapp_webhook_verify_failed", correlationId, { reason: "TOKEN_OR_MODE_MISMATCH" });
      return new NextResponse("Forbidden", { status: 403 });
    }
    logWhatsApp("info", "whatsapp_webhook_verify_success", correlationId);
    return new NextResponse(challenge, { status: 200 });
  } catch {
    logWhatsApp("warn", "whatsapp_config_check", correlationId, { status: "CONFIG_MISSING" });
    return new NextResponse("Webhook not configured", { status: 503 });
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES)
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES)
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  try {
    if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      logWhatsApp("warn", "whatsapp_signature_invalid", correlationId, { signaturePresent: request.headers.has("x-hub-signature-256") });
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }
    logWhatsApp("info", "whatsapp_signature_valid", correlationId);
  } catch {
    logWhatsApp("warn", "whatsapp_config_check", correlationId, { status: "CONFIG_MISSING" });
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const messages = parseMetaWhatsAppMessages(payload);
  logWhatsApp("info", "whatsapp_webhook_received", correlationId, { messageCount: messages.length });
  if (!messages.length) return NextResponse.json({ ok: true, received: 0 });

  const client = createAdminClient();
  const acceptedIds: string[] = [];
  for (const message of messages) {
    const { error } = await client.from("whatsapp_webhook_events").upsert(
      {
        provider: "META_CLOUD_API",
        provider_message_id: message.providerMessageId,
        sender_wa_id: message.from,
        profile_name: message.profileName ?? null,
        message_type: message.type,
        text_body: message.text || null,
        occurred_at: message.occurredAt,
        payload: message.raw,
        processing_status: message.type === "text" ? "RECEIVED" : "UNSUPPORTED",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_message_id", ignoreDuplicates: true },
    );
    if (error) {
      logWhatsApp("error", "whatsapp_webhook_persist_failed", message.providerMessageId, { code: error.code ?? "PERSIST_FAILED" });
      return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }
    if (message.type === "text") acceptedIds.push(message.providerMessageId);
  }

  after(async () => {
    for (const providerMessageId of acceptedIds) {
      const processed = await processWhatsAppWebhookEvent(providerMessageId);
      const skipped = "skipped" in processed && processed.skipped;
      const unsupported = "unsupported" in processed && processed.unsupported;
      const suppressed = "suppressed" in processed && processed.suppressed;
      if (processed.ok && !skipped && !unsupported && !suppressed)
        await deliverWhatsAppOutboxMessage(providerMessageId);
    }
  });

  return NextResponse.json({ ok: true, received: messages.length });
}
