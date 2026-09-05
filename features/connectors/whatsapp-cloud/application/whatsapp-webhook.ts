import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppWebhookEvent =
  | {
      kind: "MESSAGE";
      providerEventId: string;
      waId: string;
      phoneNumberId: string;
      profileName?: string;
      messageType: string;
      text?: string;
      occurredAt: string;
      payload: unknown;
    }
  | {
      kind: "STATUS";
      providerEventId: string;
      waId?: string;
      phoneNumberId: string;
      messageId: string;
      status: string;
      occurredAt: string;
      payload: unknown;
    };

type MetaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          recipient_id?: string;
          status?: string;
          timestamp?: string;
        }>;
      };
    }>;
  }>;
};

function timestamp(value?: string) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppWebhookEvent[] {
  const root = payload as MetaWebhook;
  const events: WhatsAppWebhookEvent[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;
      const profiles = new Map((value.contacts ?? []).flatMap((contact) => contact.wa_id ? [[contact.wa_id, contact.profile?.name]] : []));
      for (const message of value.messages ?? []) {
        if (!message.id || !message.from) continue;
        events.push({
          kind: "MESSAGE",
          providerEventId: message.id,
          waId: message.from,
          phoneNumberId,
          profileName: profiles.get(message.from),
          messageType: message.type ?? "unknown",
          text: message.type === "text" ? message.text?.body : undefined,
          occurredAt: timestamp(message.timestamp),
          payload: message,
        });
      }
      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue;
        events.push({
          kind: "STATUS",
          providerEventId: `status:${status.id}:${status.status}:${status.timestamp ?? "unknown"}`,
          waId: status.recipient_id,
          phoneNumberId,
          messageId: status.id,
          status: status.status,
          occurredAt: timestamp(status.timestamp),
          payload: status,
        });
      }
    }
  }
  return events;
}
