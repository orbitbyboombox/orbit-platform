import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const responderUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts", import.meta.url);
const policyUrl = new URL("../features/connectors/whatsapp-cloud/bianca-policy.ts", import.meta.url);
const processorUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", import.meta.url);
const catalogUrl = new URL("../features/connectors/whatsapp-cloud/whatsapp-catalog.delivery.ts", import.meta.url);
const hubUrl = new URL("../features/communication-hub/engine/communication-hub.engine.ts", import.meta.url);

test("WhatsApp AI is conversation-first and waits when the customer will send more data", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /Lee toda la conversación antes de responder/);
  assert.match(source, /Si dice que mandará más datos/);
  assert.match(source, /no lo interrogues/);
  assert.match(source, /CLIENTE_ENVIARA_MAS_DATOS/);
  assert.match(source, /WAIT_FOR_CUSTOMER/);
  assert.match(source, /Haz como máximo 1 o 2 preguntas por mensaje/);
  assert.match(source, /Cuéntame qué tipo de evento estás organizando y la fecha/);
});

test("BIANCA uses the canonical BOOMBOX commercial education and service vocabulary", async () => {
  const source = await readFile(responderUrl, "utf8");
  for (const service of ["Classic", "Polaroid", "Black Studio", "BBOX360", "LightBox", "BoomBall", "Instabox", "Video Lounge", "Hashtag", "Photo IA"]) {
    assert.match(source, new RegExp(service.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }
  assert.match(source, /Ejecutiva Comercial Digital de BOOMBOX/);
  assert.match(source, /alternativa más simple/);
  assert.match(source, /HUMAN_HANDOFF\/HUMAN_REQUIRED/);
  assert.match(source, /¿En qué comuna es tu evento\?/);
  assert.match(source, /¿Cuál es el lugar o centro de eventos\?/);
});

test("price objections get an empathetic safe response without inventing a discount", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /const PRICE_OBJECTION/);
  assert.match(source, /OBJECION_PRECIO/);
  assert.match(source, /Te entiendo\. Si quieres, puedo revisar una alternativa más simple/);
  assert.match(source, /FORCED_MANUAL_REVIEW/);
});

test("the model has no authority to invent commercial truth", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /Jamás inventes, calcules, estimes, extrapoles o sugieras precios/);
  assert.match(source, /MONEY_OR_AVAILABILITY_CLAIM/);
  assert.match(source, /COMMERCIAL_LOOKUP/);
  assert.match(source, /MANUAL_REVIEW/);
  assert.match(source, /safeCommercialFallback/);
});

test("standard flows route to canonical catalogs and special flows force manual review", async () => {
  const source = await readFile(responderUrl, "utf8");
  assert.match(source, /CATALOG_LOOKUP/);
  assert.match(source, /catálogo oficial Novios\/Matrimonios activo/);
  assert.match(source, /catálogo oficial Eventos activo/);
  assert.match(source, /catálogo oficial Empresas activo/);
  assert.match(source, /FORCED_MANUAL_REVIEW/);
  assert.match(source, /requestedAction: "MANUAL_REVIEW"/);
});

test("catalog delivery uses active ORBIT documents and is fail-closed", async () => {
  const source = await readFile(catalogUrl, "utf8");
  assert.match(source, /WHATSAPP_COMMERCIAL_ACTIONS_ENABLED/);
  assert.match(source, /\.eq\("status", "ACTIVE"\)/);
  assert.match(source, /commercial_documents/);
  assert.match(source, /commercial_email_templates/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /LINK_AND_ATTACHMENT/);
});

test("only confirmed AI fields enter canonical customer memory", async () => {
  const source = await readFile(processorUrl, "utf8");
  assert.match(source, /item\.confidence !== "CONFIRMED"/);
  assert.match(source, /whatsappAi:/);
  assert.match(source, /confirmedFields/);
  assert.match(source, /conversationSummary/);
});

test("catalog confirmation is based on real send result", async () => {
  const source = await readFile(processorUrl, "utf8");
  assert.match(source, /result\.status === "SENT" \|\| result\.status === "ALREADY_SENT"/);
  assert.match(source, /ya te enviamos el catálogo al correo/);
  assert.match(source, /result\.status === "MISSING_EMAIL"/);
  assert.match(source, /result\.status === "FAILED"/);
  assert.match(source, /forcedHumanReview/);
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

test("BIANCA handoff points to the official human number without migrating it", async () => {
  const policy = await readFile(policyUrl, "utf8");
  const responder = await readFile(responderUrl, "utf8");
  assert.match(policy, /BIANCA_WHATSAPP_NUMBER = "\+56930130927"/);
  assert.match(policy, /OFFICIAL_SALES_WHATSAPP_NUMBER = "\+56963040989"/);
  assert.match(policy, /HABLAR CON EQUIPO BOOMBOX/);
  assert.match(policy, /wa\.me\/56963040989/);
  assert.match(responder, /officialSalesHandoffCopy/);
  assert.doesNotMatch(responder, /migrate|transfer.*conversation|copy.*conversation/i);
});
