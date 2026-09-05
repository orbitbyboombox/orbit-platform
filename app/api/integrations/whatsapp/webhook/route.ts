import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWhatsAppWebhook, verifyWhatsAppWebhookSignature } from "@/features/connectors/whatsapp-cloud/application/whatsapp-webhook";
import { WhatsAppCloudRepository } from "@/features/connectors/whatsapp-cloud/repository/whatsapp-cloud.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (!verifyToken) return new NextResponse("WhatsApp webhook is not configured.", { status: 503 });
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Webhook verification failed.", { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ ok: false, error: "WhatsApp webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const repository = new WhatsAppCloudRepository(createAdminClient());
  const events = parseWhatsAppWebhook(payload);

  for (const event of events) {
    const claimed = await repository.claimWebhookEvent(event);
    if (!claimed) continue;
    try {
      if (event.kind === "STATUS") {
        await repository.applyDeliveryStatus(event);
        await repository.markWebhookEvent(event.providerEventId, "PROCESSED");
        continue;
      }

      const identity = await repository.ensureIdentity(event);
      if (event.messageType !== "text" || !event.text?.trim()) {
        await repository.log("info", "INBOUND_UNSUPPORTED", event.providerEventId, "Mensaje WhatsApp recibido; tipo aún no habilitado para NOVA.", {
          messageType: event.messageType,
          waId: event.waId,
          customerId: identity.customerId,
          conversationId: identity.conversationId,
        });
        await repository.markWebhookEvent(event.providerEventId, "IGNORED");
        continue;
      }

      await repository.recordInboundText(event, identity);
      await repository.log("info", "INBOUND_TEXT", event.providerEventId, "Mensaje WhatsApp ingresado a ORBIT.", {
        customerId: identity.customerId,
        conversationId: identity.conversationId,
        humanHandoff: identity.humanHandoff,
        novaEnabled: identity.novaEnabled,
        automaticReplyEnabled: process.env.WHATSAPP_AUTO_REPLY_ENABLED === "true",
      });

      // Deliberately fail-closed during bridge certification. Inbound traffic is live-safe,
      // but NOVA is not invoked from WhatsApp until its conversational policy is certified.
      await repository.markWebhookEvent(event.providerEventId, "PROCESSED");
    } catch (error) {
      await repository.markWebhookEvent(event.providerEventId, "FAILED", error);
      await repository.log("error", "WEBHOOK_PROCESSING", event.providerEventId, "Fallo procesando evento WhatsApp.", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
