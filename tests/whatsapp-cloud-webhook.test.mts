import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  parseWhatsAppWebhook,
  verifyWhatsAppWebhookSignature,
} from "../features/connectors/whatsapp-cloud/application/whatsapp-webhook.ts";

test("verifies Meta webhook HMAC signature", () => {
  const secret = "test-secret";
  const raw = JSON.stringify({ object: "whatsapp_business_account" });
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyWhatsAppWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyWhatsAppWebhookSignature(`${raw}x`, signature, secret), false);
  assert.equal(verifyWhatsAppWebhookSignature(raw, "sha256=not-hex", secret), false);
  assert.equal(verifyWhatsAppWebhookSignature(raw, null, secret), false);
});

test("parses inbound text and delivery status events", () => {
  const events = parseWhatsAppWebhook({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "123456" },
          contacts: [{ wa_id: "56911112222", profile: { name: "Carolina" } }],
          messages: [{
            id: "wamid.inbound-1",
            from: "56911112222",
            timestamp: "1788630000",
            type: "text",
            text: { body: "Hola, quiero cotizar un matrimonio" },
          }],
          statuses: [{
            id: "wamid.outbound-1",
            recipient_id: "56911112222",
            status: "delivered",
            timestamp: "1788630001",
          }],
        },
      }],
    }],
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    kind: "MESSAGE",
    providerEventId: "wamid.inbound-1",
    waId: "56911112222",
    phoneNumberId: "123456",
    profileName: "Carolina",
    messageType: "text",
    text: "Hola, quiero cotizar un matrimonio",
    occurredAt: new Date(1788630000 * 1000).toISOString(),
    payload: {
      id: "wamid.inbound-1",
      from: "56911112222",
      timestamp: "1788630000",
      type: "text",
      text: { body: "Hola, quiero cotizar un matrimonio" },
    },
  });
  assert.equal(events[1]?.kind, "STATUS");
  if (events[1]?.kind === "STATUS") {
    assert.equal(events[1].messageId, "wamid.outbound-1");
    assert.equal(events[1].status, "delivered");
    assert.equal(events[1].providerEventId, "status:wamid.outbound-1:delivered:1788630001");
  }
});
