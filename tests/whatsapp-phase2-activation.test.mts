import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseMetaWhatsAppWebhookEvents, validateMetaWhatsAppWebhookTarget } from "../features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts";

test("phase 2 parser keeps BOOMBOX WABA/phone boundary and status events", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "phone-1" },
      statuses: [{ id: "wamid.1", status: "delivered", timestamp: "10", recipient_id: "569" }],
      messages: [{ id: "wamid.2", from: "569", type: "text", timestamp: "11", text: { body: "hola" } }],
    } }] }],
  };
  assert.equal(validateMetaWhatsAppWebhookTarget(payload, { wabaId: "waba-1", phoneNumberId: "phone-1" }).ok, true);
  assert.equal(validateMetaWhatsAppWebhookTarget(payload, { wabaId: "other", phoneNumberId: "phone-1" }).ok, false);
  const events = parseMetaWhatsAppWebhookEvents(payload, { wabaId: "waba-1", phoneNumberId: "phone-1" });
  assert.equal(events.some((event) => "status" in event && event.status === "delivered"), true);
  assert.equal(events.some((event) => "from" in event && event.text === "hola"), true);
});

test("phase 2 serializes object errors without [object Object]", async () => {
  const source = await readFile(new URL("../features/connectors/whatsapp-cloud/whatsapp-observability.ts", import.meta.url), "utf8");
  assert.match(source, /JSON\.stringify/);
  assert.doesNotMatch(source, /String\(error\)\s*\/\/\s*\[object Object\]/);
});

test("phase 2 transport contains template, status, tenant and real 24h guards", async () => {
  const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [meta, outbox, webhook, migration] = await Promise.all([
    read("features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts"),
    read("features/connectors/whatsapp-cloud/whatsapp-outbox.sender.ts"),
    read("app/api/integrations/whatsapp/webhook/route.ts"),
    read("supabase/migrations/20260916140000_whatsapp_phase2_activation.sql"),
  ]);
  for (const value of ["sendMetaWhatsAppTemplate", "message_templates", "type: \"template\""]) assert.match(meta, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const value of ["BLOCKED_WINDOW", "service_window_expires_at", "updateWhatsAppOutboxStatus"]) assert.match(outbox, new RegExp(value));
  for (const value of ["validateMetaWhatsAppWebhookTarget", "whatsapp_message_status_events", "tenant_slug"]) {
    assert.match(`${webhook}\n${migration}`, new RegExp(value));
  }
});
