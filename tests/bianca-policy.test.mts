import test from "node:test";
import assert from "node:assert/strict";
import { BIANCA_INTRODUCTION, biancaCanProcessCustomerMessage, biancaQaPhoneAuthorized, biancaQaPhoneNumbers, founderRequestResponse, isFounderRequest, normalizeBiancaQaPhone } from "../features/connectors/whatsapp-cloud/bianca-policy.ts";

test("BIANCA gates are fail-closed and require both customer messaging and AI", () => {
  const before = { messaging: process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED, ai: process.env.BIANCA_AI_ENABLED, outbound: process.env.BIANCA_OUTBOUND_ENABLED };
  delete process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED;
  delete process.env.BIANCA_AI_ENABLED;
  delete process.env.BIANCA_OUTBOUND_ENABLED;
  assert.equal(biancaCanProcessCustomerMessage(), false);
  process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED = "true";
  assert.equal(biancaCanProcessCustomerMessage(), false);
  process.env.BIANCA_AI_ENABLED = "true";
  assert.equal(biancaCanProcessCustomerMessage(), false);
  process.env.BIANCA_OUTBOUND_ENABLED = "true";
  assert.equal(biancaCanProcessCustomerMessage(), true);
  if (before.messaging === undefined) delete process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED;
  else process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED = before.messaging;
  if (before.ai === undefined) delete process.env.BIANCA_AI_ENABLED;
  else process.env.BIANCA_AI_ENABLED = before.ai;
  if (before.outbound === undefined) delete process.env.BIANCA_OUTBOUND_ENABLED;
  else process.env.BIANCA_OUTBOUND_ENABLED = before.outbound;
});

test("Founder request is deterministic and never impersonates Matías", () => {
  assert.equal(isFounderRequest("Hola Matías, ¿estás?"), true);
  assert.equal(isFounderRequest("Quiero hablar con una persona"), true);
  assert.equal(isFounderRequest("¿Qué servicios tienen?"), false);
  const response = founderRequestResponse();
  assert.match(response, /BIANCA de BOOMBOX/);
  assert.match(response, /Matías recibe tus mensajes/);
  assert.doesNotMatch(response, /Soy Matías/);
  assert.equal(BIANCA_INTRODUCTION, "¡Hola! Soy BIANCA de BOOMBOX 😊");
});

test("customer-facing delivery remains independently disabled by WHATSAPP_DELIVERY_ENABLED", async () => {
  const { whatsappDeliveryEnabled } = await import("../features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts");
  const before = process.env.WHATSAPP_DELIVERY_ENABLED;
  delete process.env.WHATSAPP_DELIVERY_ENABLED;
  assert.equal(whatsappDeliveryEnabled(), false);
  if (before === undefined) delete process.env.WHATSAPP_DELIVERY_ENABLED;
  else process.env.WHATSAPP_DELIVERY_ENABLED = before;
});

test("QA mode can authorize exactly one conversation without opening global BIANCA", () => {
  const before = {
    mode: process.env.BIANCA_QA_MODE,
    conversation: process.env.BIANCA_QA_CONVERSATION_ID,
    messaging: process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED,
    ai: process.env.BIANCA_AI_ENABLED,
    outbound: process.env.BIANCA_OUTBOUND_ENABLED,
  };
  process.env.BIANCA_QA_MODE = "true";
  process.env.BIANCA_QA_CONVERSATION_ID = "qa-conversation";
  delete process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED;
  delete process.env.BIANCA_AI_ENABLED;
  delete process.env.BIANCA_OUTBOUND_ENABLED;
  assert.equal(biancaCanProcessCustomerMessage("qa-conversation"), true);
  assert.equal(biancaCanProcessCustomerMessage("other-conversation"), false);
  assert.equal(biancaCanProcessCustomerMessage(), false);
  for (const [key, value] of Object.entries({
    BIANCA_QA_MODE: before.mode,
    BIANCA_QA_CONVERSATION_ID: before.conversation,
    BIANCA_CUSTOMER_MESSAGING_ENABLED: before.messaging,
    BIANCA_AI_ENABLED: before.ai,
    BIANCA_OUTBOUND_ENABLED: before.outbound,
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("QA mode authorizes multiple normalized phone numbers without enabling global automation", () => {
  const before = {
    mode: process.env.BIANCA_QA_MODE,
    conversation: process.env.BIANCA_QA_CONVERSATION_ID,
    phones: process.env.BIANCA_QA_PHONE_NUMBERS,
    messaging: process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED,
    ai: process.env.BIANCA_AI_ENABLED,
    outbound: process.env.BIANCA_OUTBOUND_ENABLED,
  };
  process.env.BIANCA_QA_MODE = "true";
  process.env.BIANCA_QA_CONVERSATION_ID = "";
  process.env.BIANCA_QA_PHONE_NUMBERS = "+56911111111, 56922222222, 9 33333333, +56 9 11111111";
  delete process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED;
  delete process.env.BIANCA_AI_ENABLED;
  delete process.env.BIANCA_OUTBOUND_ENABLED;

  assert.equal(normalizeBiancaQaPhone("56911111111"), "+56911111111");
  assert.equal(normalizeBiancaQaPhone("9 33333333"), "+56933333333");
  assert.deepEqual(biancaQaPhoneNumbers(), ["+56911111111", "+56922222222", "+56933333333"]);
  assert.equal(biancaQaPhoneAuthorized("+56 9 1111-1111"), true);
  assert.equal(biancaCanProcessCustomerMessage(undefined, "56922222222"), true);
  assert.equal(biancaCanProcessCustomerMessage(undefined, "56999999999"), false);
  assert.equal(biancaCanProcessCustomerMessage(), false);

  for (const [key, value] of Object.entries({
    BIANCA_QA_MODE: before.mode,
    BIANCA_QA_CONVERSATION_ID: before.conversation,
    BIANCA_QA_PHONE_NUMBERS: before.phones,
    BIANCA_CUSTOMER_MESSAGING_ENABLED: before.messaging,
    BIANCA_AI_ENABLED: before.ai,
    BIANCA_OUTBOUND_ENABLED: before.outbound,
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("QA phone whitelist remains disabled when QA mode is off", () => {
  const before = { mode: process.env.BIANCA_QA_MODE, phones: process.env.BIANCA_QA_PHONE_NUMBERS };
  process.env.BIANCA_QA_MODE = "false";
  process.env.BIANCA_QA_PHONE_NUMBERS = "+56911111111";
  assert.equal(biancaCanProcessCustomerMessage(undefined, "+56911111111"), false);
  if (before.mode === undefined) delete process.env.BIANCA_QA_MODE; else process.env.BIANCA_QA_MODE = before.mode;
  if (before.phones === undefined) delete process.env.BIANCA_QA_PHONE_NUMBERS; else process.env.BIANCA_QA_PHONE_NUMBERS = before.phones;
});
