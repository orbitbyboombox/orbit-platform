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
  wabaId?: string;
  phoneNumberId?: string;
}

export interface MetaWhatsAppStatusEvent {
  providerStatusId: string;
  providerMessageId: string;
  recipientWaId?: string;
  status: "sent" | "delivered" | "read" | "failed";
  statusCode?: string;
  statusMessage?: string;
  occurredAt: string;
  raw: Record<string, unknown>;
  wabaId?: string;
  phoneNumberId?: string;
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
  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: Array<{ code?: number | string; title?: string; message?: string }>;
  }>;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaWebhookValue }>;
  }>;
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
}

interface MetaTemplateResponse {
  data?: Array<{ name?: string; language?: string; status?: string; category?: string }>;
}

export function validateMetaWhatsAppWebhookTarget(payload: unknown, expected: { wabaId: string; phoneNumberId: string }) {
  if (!payload || typeof payload !== "object") return { ok: false as const, reason: "INVALID_PAYLOAD" };
  const body = payload as MetaWebhookPayload;
  if (body.object !== "whatsapp_business_account") return { ok: false as const, reason: "INVALID_OBJECT" };
  const entries = body.entry ?? [];
  if (!entries.length || entries.some((entry) => entry.id !== expected.wabaId)) return { ok: false as const, reason: "WABA_MISMATCH" };
  const values = entries.flatMap((entry) => (entry.changes ?? []).filter((change) => change.field === "messages").map((change) => change.value));
  if (!values.length || values.some((value) => value?.metadata?.phone_number_id !== expected.phoneNumberId)) return { ok: false as const, reason: "PHONE_NUMBER_MISMATCH" };
  return { ok: true as const };
}

const env = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};

export class MetaWhatsAppRejectedError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super(`WhatsApp send rejected (${status}).`);
    this.status = status;
    this.name = "MetaWhatsAppRejectedError";
  }
}

export function whatsappDeliveryEnabled() {
  return process.env.WHATSAPP_DELIVERY_ENABLED?.trim().toLowerCase() === "true";
}

export function whatsappAutomationEnabled() {
  return process.env.WHATSAPP_AUTOMATION_ENABLED?.trim().toLowerCase() === "true";
}

export function whatsappBusinessAccountId() {
  return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "";
}

export function whatsappGraphConfig() {
  const graphVersion = env("WHATSAPP_GRAPH_VERSION");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = env("WHATSAPP_BUSINESS_ACCOUNT_ID");
  return { graphVersion, phoneNumberId, wabaId };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  return safeEqual(received.toLowerCase(), expected);
}

export function verifyMetaChallenge(url: URL) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const configuredToken = env("WHATSAPP_VERIFY_TOKEN");
  if (mode !== "subscribe" || !token || !safeEqual(token, configuredToken) || !challenge) return null;
  return challenge;
}

export function parseMetaWhatsAppWebhookEvents(payload: unknown, expected?: { wabaId?: string; phoneNumberId?: string }) {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as MetaWebhookPayload;
  if (body.object !== "whatsapp_business_account") return [];
  const events: Array<MetaWhatsAppInboundMessage | MetaWhatsAppStatusEvent> = [];

  for (const entry of body.entry ?? []) {
    if (expected?.wabaId && entry.id !== expected.wabaId) continue;
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (expected?.phoneNumberId && value?.metadata?.phone_number_id !== expected.phoneNumberId) continue;
      const profileName = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        const type = message.type ?? "unknown";
        const text = type === "text" ? message.text?.body?.trim() ?? "" : "";
        events.push({
          providerMessageId: message.id,
          from: message.from,
          profileName,
          occurredAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          text,
          type,
          raw: message as unknown as Record<string, unknown>,
          wabaId: entry.id,
          phoneNumberId: value?.metadata?.phone_number_id,
        });
      }
      for (const status of value?.statuses ?? []) {
        if (!status.id || !status.status || !["sent", "delivered", "read", "failed"].includes(status.status)) continue;
        const error = status.errors?.[0];
        events.push({
          providerStatusId: `${status.id}:${status.status}`,
          providerMessageId: status.id,
          recipientWaId: status.recipient_id,
          status: status.status as MetaWhatsAppStatusEvent["status"],
          statusCode: error?.code === undefined ? undefined : String(error.code),
          statusMessage: error?.message || error?.title,
          occurredAt: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
          raw: status as unknown as Record<string, unknown>,
          wabaId: entry.id,
          phoneNumberId: value?.metadata?.phone_number_id,
        });
      }
    }
  }
  return events;
}

export function parseMetaWhatsAppMessages(payload: unknown): MetaWhatsAppInboundMessage[] {
  return parseMetaWhatsAppWebhookEvents(payload).filter((event): event is MetaWhatsAppInboundMessage => "providerMessageId" in event && "from" in event);
}

export async function sendMetaWhatsAppText(to: string, content: string) {
  if (!whatsappDeliveryEnabled()) throw new Error("WhatsApp delivery is disabled.");
  const { graphVersion, phoneNumberId } = whatsappGraphConfig();
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
  if (!response.ok) throw new MetaWhatsAppRejectedError(response.status);
  const payload = await response.json() as MetaSendResponse;
  return { providerMessageId: payload.messages?.[0]?.id ?? null };
}

export async function sendMetaWhatsAppTemplate(input: {
  to: string;
  name: string;
  language: string;
  parameters?: string[];
}) {
  if (!whatsappDeliveryEnabled()) throw new Error("WhatsApp delivery is disabled.");
  const { graphVersion, phoneNumberId } = whatsappGraphConfig();
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.name,
        language: { code: input.language },
        ...(input.parameters?.length ? { components: [{ type: "body", parameters: input.parameters.map((text) => ({ type: "text", text })) }] } : {}),
      },
    }),
  });
  if (!response.ok) throw new MetaWhatsAppRejectedError(response.status);
  const payload = await response.json() as MetaSendResponse;
  return { providerMessageId: payload.messages?.[0]?.id ?? null };
}

export async function listMetaWhatsAppTemplates() {
  const { graphVersion, wabaId } = whatsappGraphConfig();
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?fields=name,language,status,category`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new MetaWhatsAppRejectedError(response.status);
  const payload = await response.json() as MetaTemplateResponse;
  return (payload.data ?? []).filter((template) => template.status === "APPROVED");
}

export class MetaWhatsAppCloudDispatcher implements CommunicationChannelDispatcher {
  async dispatch(request: ChannelDispatchRequest): Promise<void> {
    if (request.channel !== "WHATSAPP_BUSINESS")
      throw new Error(`MetaWhatsAppCloudDispatcher cannot dispatch ${request.channel}.`);
    if (!request.content.trim()) return;
    await sendMetaWhatsAppText(request.participantId, request.content);
  }
}
