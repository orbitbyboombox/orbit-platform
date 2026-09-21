import { after } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseMetaWhatsAppWebhookEvents,
  validateMetaWhatsAppWebhookTarget,
  verifyMetaChallenge,
  verifyMetaWebhookSignature,
} from "@/features/connectors/whatsapp-cloud/meta-whatsapp-cloud";
import { processWhatsAppWebhookEventDebounced } from "@/features/connectors/whatsapp-cloud/whatsapp-orbit.processor";
import { deliverWhatsAppOutboxMessage, updateWhatsAppOutboxStatus } from "@/features/connectors/whatsapp-cloud/whatsapp-outbox.sender";
import { logWhatsApp } from "@/features/connectors/whatsapp-cloud/whatsapp-observability";
import { WHATSAPP_TENANT_SLUG } from "@/features/connectors/whatsapp-cloud/whatsapp-tenant";

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

  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!wabaId || !phoneNumberId) {
    logWhatsApp("warn", "whatsapp_config_check", correlationId, { status: "CONFIG_MISSING" });
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }
  const target = validateMetaWhatsAppWebhookTarget(payload, { wabaId, phoneNumberId });
  if (!target.ok) {
    logWhatsApp("warn", "whatsapp_tenant_boundary_rejected", correlationId, { reason: target.reason });
    return NextResponse.json({ ok: false, error: "webhook_target_mismatch" }, { status: 422 });
  }

  const events = parseMetaWhatsAppWebhookEvents(payload, { wabaId, phoneNumberId });
  logWhatsApp("info", "whatsapp_webhook_received", correlationId, {
    messageCount: events.filter((event) => "from" in event).length,
    statusCount: events.filter((event) => "status" in event).length,
  });
  if (!events.length) return NextResponse.json({ ok: true, received: 0 });

  const client = createAdminClient();
  const acceptedIds: string[] = [];
  for (const event of events) {
    if ("from" in event) {
      const { error } = await client.from("whatsapp_webhook_events").upsert(
        {
          tenant_slug: WHATSAPP_TENANT_SLUG,
          provider: "META_CLOUD_API",
          provider_message_id: event.providerMessageId,
          sender_wa_id: event.from,
          profile_name: event.profileName ?? null,
          message_type: event.type,
          text_body: event.text || null,
          occurred_at: event.occurredAt,
          payload: event.raw,
          waba_id: event.wabaId ?? wabaId,
          phone_number_id: event.phoneNumberId ?? phoneNumberId,
          event_kind: "MESSAGE",
          processing_status: event.type === "text" ? "RECEIVED" : "UNSUPPORTED",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_message_id", ignoreDuplicates: true },
      );
      if (error) {
        logWhatsApp("error", "whatsapp_webhook_persist_failed", event.providerMessageId, { code: error.code ?? "PERSIST_FAILED" });
        return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
      }
      if (event.type === "text") acceptedIds.push(event.providerMessageId);
      continue;
    }

    const { error } = await client.from("whatsapp_message_status_events").upsert({
      tenant_slug: WHATSAPP_TENANT_SLUG,
      provider: "META_CLOUD_API",
      provider_status_id: event.providerStatusId,
      provider_message_id: event.providerMessageId,
      recipient_wa_id: event.recipientWaId ?? null,
      status: event.status,
      status_code: event.statusCode ?? null,
      status_message: event.statusMessage ?? null,
      occurred_at: event.occurredAt,
      payload: event.raw,
    }, { onConflict: "tenant_slug,provider_status_id,status", ignoreDuplicates: true });
    if (error) {
      logWhatsApp("error", "whatsapp_status_persist_failed", event.providerStatusId, { code: error.code ?? "STATUS_PERSIST_FAILED" });
      return NextResponse.json({ ok: false, error: "status_persist_failed" }, { status: 500 });
    }
    await updateWhatsAppOutboxStatus(event);
  }

  after(async () => {
    for (const providerMessageId of acceptedIds) {
      const processed = await processWhatsAppWebhookEventDebounced(providerMessageId);
      const skipped = "skipped" in processed && processed.skipped;
      const unsupported = "unsupported" in processed && processed.unsupported;
      const suppressed = "suppressed" in processed && processed.suppressed;
      if (processed.ok && !skipped && !unsupported && !suppressed) {
        const delivery = await deliverWhatsAppOutboxMessage(providerMessageId);
        if (!delivery.ok) {
          const error = "error" in delivery && delivery.error ? delivery.error : "DELIVERY_FAILED";
          await client.from("whatsapp_webhook_events").update({
            processing_status: "FAILED",
            processing_error: error,
            updated_at: new Date().toISOString(),
          }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("provider_message_id", providerMessageId);
          logWhatsApp("error", "whatsapp_response_delivery_failed", providerMessageId, { error });
        }
      }
    }
  });

  return NextResponse.json({ ok: true, received: events.length });
}
