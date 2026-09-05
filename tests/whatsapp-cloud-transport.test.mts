import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const transportUrl = new URL("../features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts", import.meta.url);
const webhookUrl = new URL("../app/api/integrations/whatsapp/webhook/route.ts", import.meta.url);
const processorUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", import.meta.url);
const outboxUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-outbox.sender.ts", import.meta.url);
const ingressMigrationUrl = new URL("../supabase/migrations/0211_whatsapp_cloud_transport_core.sql", import.meta.url);
const identityMigrationUrl = new URL("../supabase/migrations/0212_whatsapp_customer_identity.sql", import.meta.url);
const outboxMigrationUrl = new URL("../supabase/migrations/0213_whatsapp_outbox.sql", import.meta.url);

test("WhatsApp webhook requires Meta verification and HMAC signature", async () => {
  const [transport, webhook] = await Promise.all([
    readFile(transportUrl, "utf8"),
    readFile(webhookUrl, "utf8"),
  ]);
  assert.match(transport, /WHATSAPP_VERIFY_TOKEN/);
  assert.match(transport, /WHATSAPP_APP_SECRET/);
  assert.match(transport, /createHmac\("sha256"/);
  assert.match(transport, /timingSafeEqual/);
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /invalid_signature/);
});

test("ingress and outbound ledgers are idempotent", async () => {
  const [ingressMigration, outboxMigration] = await Promise.all([
    readFile(ingressMigrationUrl, "utf8"),
    readFile(outboxMigrationUrl, "utf8"),
  ]);
  assert.match(ingressMigration, /unique\(provider, provider_message_id\)/);
  assert.match(outboxMigration, /correlation_id text not null unique/);
  assert.match(outboxMigration, /'AMBIGUOUS'/);
});

test("WhatsApp CRM identity is phone-canonical and service-role only", async () => {
  const migration = await readFile(identityMigrationUrl, "utf8");
  assert.match(migration, /regexp_replace\(coalesce\(p_sender_wa_id/);
  assert.match(migration, /regexp_replace\(coalesce\(c\.phone/);
  assert.match(migration, /revoke all on function public\.resolve_whatsapp_customer/);
  assert.match(migration, /grant execute on function public\.resolve_whatsapp_customer\(text,text\) to service_role/);
});

test("human takeover remains a hard suppression boundary", async () => {
  const processor = await readFile(processorUrl, "utf8");
  assert.match(processor, /row\.status === "HUMAN_HANDOFF" \|\| row\.nova_enabled === false/);
  assert.match(processor, /if \(!result\.suppressed\)/);
});

test("real WhatsApp delivery is fail-closed and ambiguous sends are not silently retried", async () => {
  const [transport, sender] = await Promise.all([
    readFile(transportUrl, "utf8"),
    readFile(outboxUrl, "utf8"),
  ]);
  assert.match(transport, /WHATSAPP_DELIVERY_ENABLED/);
  assert.match(transport, /=== "true"/);
  assert.match(sender, /status: safelyRejected \? "FAILED" : "AMBIGUOUS"/);
  assert.match(sender, /\.eq\("status", "PENDING"\)/);
});
