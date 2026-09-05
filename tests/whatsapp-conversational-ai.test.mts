import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const responderUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts", import.meta.url);
const processorUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", import.meta.url);
const hubUrl = new URL("../features/communication-hub/engine/communication-hub.engine.ts", import.meta.url);

test("WhatsApp AI is conversation-first and waits when the customer will send more data", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /Lee toda la conversación antes de responder/);
  assert.match(source, /Si dice que mandará más datos/);
  assert.match(source, /no lo interrogues/);
  assert.match(source, /CLIENTE_ENVIARA_MAS_DATOS/);
  assert.match(source, /WAIT_FOR_CUSTOMER/);
});

test("the model has no authority to invent commercial truth", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /Jamás inventes, calcules, estimes, extrapoles o sugieras precios/);
  assert.match(source, /MONEY_OR_AVAILABILITY_CLAIM/);
  assert.match(source, /COMMERCIAL_LOOKUP/);
  assert.match(source, /MANUAL_REVIEW/);
  assert.match(source, /safeCommercialFallback/);
});

test("only confirmed AI fields enter canonical customer memory", async () => {
  const source = await readFile(processorUrl, "utf8");
  assert.match(source, /item\.confidence !== "CONFIRMED"/);
  assert.match(source, /whatsappAi:/);
  assert.match(source, /confirmedFields/);
  assert.match(source, /conversationSummary/);
});

test("Communication Hub awaits a pluggable responder behind the human takeover gate", async () => {
  const source = await readFile(hubUrl, "utf8");
  const gate = source.indexOf('if (novaState.humanHandoff || current?.status === "HUMAN_HANDOFF")');
  const respond = source.indexOf("await this.nova.respond");
  assert.ok(gate >= 0);
  assert.ok(respond > gate);
  assert.match(source, /private readonly nova: NovaResponder/);
});

test("customer request for a person can stop automation", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /HABLAR_CON_PERSONA/);
  assert.match(source, /requestedAction === "HUMAN_HANDOFF"/);
  assert.match(source, /return "HUMAN_HANDOFF"/);
});
