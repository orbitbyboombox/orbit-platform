import { after } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseMetaWhatsAppMessages,
  verifyMetaChallenge,
  verifyMetaWebhookSignature,
} from "@/features/connectors/whatsapp-cloud/meta-whatsapp-cloud";
import { processWhatsAppWebhookEvent } from "@/features/connectors/whatsapp-cloud/whatsapp-orbit.processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const challenge = verifyMetaChallenge(new URL(request.url));
    if (!challenge) return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse(challenge, { status: 200 });
  } catch (error) {
    console.error("whatsapp.webhook.verify_failed", error);
    return new NextResponse("Webhook not configured", { status: 503 });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256")))
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  } catch (error) {
    console.error("whatsapp.webhook.signature_config_error", error);
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const messages = parseMetaWhatsAppMessages(payload);
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
      console.error("whatsapp.webhook.persist_failed", {
        providerMessageId: message.providerMessageId,
        error: error.message,
      });
      return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }
    if (message.type === "text") acceptedIds.push(message.providerMessageId);
  }

  after(async () => {
    for (const providerMessageId of acceptedIds) {
      await processWhatsAppWebhookEvent(providerMessageId);
    }
  });

  return NextResponse.json({ ok: true, received: messages.length });
}
