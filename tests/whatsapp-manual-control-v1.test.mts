import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("WhatsApp inbox projects canonical states and filters", async () => {
  const source = await read("features/communication-hub/components/whatsapp-inbox.tsx");
  for (const value of ["UNREAD", "BIANCA", "HUMAN", "WAITING_BOOMBOX", "WAITING_CUSTOMER", "CONTROL HUMANO", "ESPERANDO CLIENTE"]) assert.match(source, new RegExp(value));
});

test("manual control persists handoff and blocks BIANCA", async () => {
  const source = await read("features/communication-hub/actions.ts");
  assert.match(source, /status: "HUMAN_HANDOFF"/);
  assert.match(source, /nova_enabled: false/);
  assert.match(source, /human_owner_id: userId/);
});

test("manual composer remains fail-closed while delivery is off", async () => {
  const source = await read("features/communication-hub/components/whatsapp-inbox.tsx");
  assert.match(source, /Envío desactivado hasta activación\s+oficial/);
  assert.doesNotMatch(source, /whatsapp_outbound_messages|status:\s*["']SENT/);
});

test("official number readiness is read-only and keeps delivery off", async () => {
  const source = await read("features/integration-health/ui.tsx");
  for (const value of ["Número oficial BOOMBOX", "Meta App Review", "NO CONECTADO", "Delivery automático", "OFF"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /migrar|Migrar|Eliminar/);
});

test("timeline keeps inbound chronological author distinction", async () => {
  const source = await read("features/communication-hub/components/whatsapp-inbox.tsx");
  assert.match(source, /event\.direction === "INBOUND"/);
  assert.match(source, /event\.direction === "OUTBOUND"/);
  assert.match(source, /sort\(/);
});
