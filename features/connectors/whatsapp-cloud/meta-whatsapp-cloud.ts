import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChannelDispatchRequest } from "@/features/communication-hub";
import type { CommunicationChannelDispatcher } from "@/features/communication-hub";

export interface MetaWhatsAppInboundMessage {
  providerMessageId: string;
  from: string;
  profileName?: string;
  occurredAt: string;
  text: string;
  type: string;
  raw: Record<string, unknown>;
}

interface MetaWebhookMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface MetaWebhookValue {
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: MetaWebhookMessage[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{ field?: string; value?: MetaWebhookValue }>;
  }>;
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
}

const env = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};

export class MetaWhatsAppRejectedError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`WhatsApp send rejected (${status}): ${detail.slice(0, 500)}`);
    this.name = "MetaWhatsAppRejectedError";
  }
}

export function whatsappDeliveryEnabled() {
  return process.env.WHATSAPP_DELIVERY_ENABLED?.trim().toLowerCase() === "true";
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function verifyMetaChallenge(url: URL) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const configuredToken = env("WHATSAPP_VERIFY_TOKEN");
  if (mode !== "subscribe" || token !== configuredToken || !challenge) return null;
  return challenge;
}

export function parseMetaWhatsAppMessages(payload: unknown): MetaWhatsAppInboundMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as MetaWebhookPayload;
  if (body.object !== "whatsapp_business_account") return [];
  const messages: MetaWhatsAppInboundMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const profileName = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        const type = message.type ?? "unknown";
        const text = type === "text" ? message.text?.body?.trim() ?? "" : "";
        messages.push({
          providerMessageId: message.id,
          from: message.from,
          profileName,
          occurredAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          text,
          type,
          raw: message as unknown as Record<string, unknown>,
        });
      }
    }
  }
  return messages;
}

export async function sendMetaWhatsAppText(to: string, content: string) {
  if (!whatsappDeliveryEnabled()) throw new Error("WhatsApp delivery is disabled.");
  const graphVersion = env("WHATSAPP_GRAPH_VERSION");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: content },
      }),
    },
  );
  if (!response.ok) throw new MetaWhatsAppRejectedError(response.status, await response.text());
  const payload = await response.json() as MetaSendResponse;
  return { providerMessageId: payload.messages?.[0]?.id ?? null };
}

export class MetaWhatsAppCloudDispatcher implements CommunicationChannelDispatcher {
  async dispatch(request: ChannelDispatchRequest): Promise<void> {
    if (request.channel !== "WHATSAPP_BUSINESS")
      throw new Error(`MetaWhatsAppCloudDispatcher cannot dispatch ${request.channel}.`);
    if (!request.content.trim()) return;
    await sendMetaWhatsAppText(request.participantId, request.content);
  }
}
