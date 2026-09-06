import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHmac } from "node:crypto";
import { parseMetaWhatsAppMessages, verifyMetaChallenge, verifyMetaWebhookSignature } from "../features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Meta GET verification returns the exact challenge and rejects the wrong token", () => {
  const previous = process.env.WHATSAPP_VERIFY_TOKEN;
  process.env.WHATSAPP_VERIFY_TOKEN = "local-test-token";
  try {
    assert.equal(verifyMetaChallenge(new URL("https://orbit.test/webhook?hub.mode=subscribe&hub.verify_token=local-test-token&hub.challenge=12345")), "12345");
    assert.equal(verifyMetaChallenge(new URL("https://orbit.test/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345")), null);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
    else process.env.WHATSAPP_VERIFY_TOKEN = previous;
  }
});

test("Meta POST signature uses HMAC-SHA256 over the unchanged raw body", () => {
  const previous = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = "local-test-secret";
  const raw = '{"object":"whatsapp_business_account","entry":[]}';
  try {
    const signature = `sha256=${createHmac("sha256", "local-test-secret").update(raw).digest("hex")}`;
    assert.equal(verifyMetaWebhookSignature(raw, signature), true);
    assert.equal(verifyMetaWebhookSignature(`${raw} `, signature), false);
    assert.equal(verifyMetaWebhookSignature(raw, "sha256=not-hex"), false);
    assert.equal(verifyMetaWebhookSignature(raw, null), false);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previous;
  }
});

test("Meta inbound parser safely extracts a text event", () => {
  const messages = parseMetaWhatsAppMessages({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "QA" } }], messages: [{ id: "wamid.qa", from: "56912345678", timestamp: "1788566400", type: "text", text: { body: "Hola" } }] } }] }] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.providerMessageId, "wamid.qa");
  assert.equal(messages[0]?.text, "Hola");
});

test("connection status is server-derived, read-only, and safe for the browser", async () => {
  const [connection, route, ui] = await Promise.all([
    read("features/connectors/whatsapp-cloud/whatsapp-connection.ts"),
    read("app/api/integrations/whatsapp/status/route.ts"),
    read("features/settings/components/connection-center.tsx"),
  ]);
  assert.match(connection, /WHATSAPP_REQUIRED_ENV_KEYS/);
  assert.match(connection, /method: "GET"/);
  assert.match(connection, /phone\.id !== phoneNumberId/);
  assert.match(route, /getConnectorAdministrator/);
  assert.match(route, /private, no-store/);
  assert.match(ui, /disabled={!connection\.controlsEnabled}/);
  assert.doesNotMatch(ui, /ACCESS_TOKEN|APP_SECRET|VERIFY_TOKEN/);
});

test("automation and all customer delivery remain disabled unless separately authorized", async () => {
  const [transport, processor, catalog] = await Promise.all([
    read("features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts"),
    read("features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts"),
    read("features/connectors/whatsapp-cloud/whatsapp-catalog.delivery.ts"),
  ]);
  assert.match(transport, /WHATSAPP_AUTOMATION_ENABLED/);
  assert.match(transport, /WHATSAPP_DELIVERY_ENABLED/);
  assert.match(catalog, /WHATSAPP_COMMERCIAL_ACTIONS_ENABLED/);
  assert.match(processor, /if \(!automationEnabled\)/);
  assert.match(processor, /nova_enabled: false/);
  assert.match(processor, /finalStatus: "HUMAN_HANDOFF"/);
});

test("Chile and international phone identity use one deterministic canonical function", async () => {
  const migration = await read("supabase/migrations/0214_whatsapp_chile_phone_normalization.sql");
  assert.match(migration, /length\(digits\) = 9 and digits like '9%'/);
  assert.match(migration, /digits := '56' \|\| digits/);
  assert.match(migration, /public\.normalize_whatsapp_phone\(c\.phone\) = normalized_phone/);
  assert.match(migration, /grant execute on function public\.resolve_whatsapp_customer\(text,text\) to service_role/);
});

test("WhatsApp identity migration preserves the CRM email invariant for email-less inbound", async () => {
  const migration = await read("supabase/migrations/0216_whatsapp_customer_email_fallback.sql");
  assert.match(migration, /fallback_email text/);
  assert.match(migration, /@inbound\.invalid/);
  assert.match(migration, /emailPlaceholder', true/);
  assert.match(migration, /insert into public\.customers\(full_name, email, phone, metadata\)/);
});

test("processor has a production fallback for legacy email NOT NULL schemas", async () => {
  const processor = await read("features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts");
  assert.match(processor, /error\.code !== "23502"/);
  assert.match(processor, /@inbound\.invalid/);
  assert.match(processor, /emailPlaceholder: true/);
});

test("webhook observability is structured and never logs payloads or tokens", async () => {
  const [route, logging] = await Promise.all([
    read("app/api/integrations/whatsapp/webhook/route.ts"),
    read("features/connectors/whatsapp-cloud/whatsapp-observability.ts"),
  ]);
  for (const event of ["whatsapp_webhook_verify_success", "whatsapp_webhook_verify_failed", "whatsapp_webhook_received", "whatsapp_signature_valid", "whatsapp_signature_invalid"])
    assert.match(route, new RegExp(event));
  assert.match(logging, /JsonConsoleLogger/);
  assert.doesNotMatch(route, /console\.(log|error|warn)/);
});

test("webhook rejects oversized bodies and defers heavy processing", async () => {
  const route = await read("app/api/integrations/whatsapp/webhook/route.ts");
  assert.match(route, /MAX_WEBHOOK_BYTES/);
  assert.match(route, /status: 413/);
  assert.match(route, /after\(async \(\) =>/);
});
