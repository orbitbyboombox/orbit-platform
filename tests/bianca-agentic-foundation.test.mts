import assert from "node:assert/strict";
import test from "node:test";
import { planBiancaTurn } from "../features/connectors/whatsapp-cloud/bianca-commercial-planner.ts";
import { detectBiancaIntents } from "../features/connectors/whatsapp-cloud/bianca-intent-engine.ts";
import { assertBiancaClaims, unsupportedBiancaClaims } from "../features/connectors/whatsapp-cloud/bianca-claim-guards.ts";
import { BIANCA_TOOL_NAMES, BIANCA_TOOL_REGISTRY } from "../features/connectors/whatsapp-cloud/bianca-tool-registry.ts";

test("planner chooses deterministic next best action from known opportunity data", () => {
  const plan = planBiancaTurn({
    text: "Classic para matrimonio, ¿cuánto sale y está disponible?",
    known: { preferredName: "Andrés", eventDate: "2026-11-21", serviceCodes: ["CLASSIC"], durationHours: 3 },
  });
  assert.deepEqual(plan.intents, ["ASK_AVAILABILITY", "ASK_PRICE"]);
  assert.equal(plan.nextBestAction, "ASK_COMMUNE");
  assert.equal(plan.leadIntent, "MEDIUM");
});

test("planner escalates negotiation and human requests", () => {
  const plan = planBiancaTurn({ text: "Está caro, necesito descuento y hablar con una persona", known: { preferredName: "Ana" } });
  assert.equal(plan.nextBestAction, "HANDOFF");
  assert.equal(plan.commercialStage, "HUMAN_REQUIRED");
});

test("claim guard blocks unsupported commercial statements", () => {
  assert.deepEqual(unsupportedBiancaClaims("Está disponible y cuesta $500.000", {}), ["PRICE_LOOKUP_REQUIRED", "AVAILABILITY_LOOKUP_REQUIRED"]);
  assert.throws(() => assertBiancaClaims("Te envié el catálogo", {}), /SEND_CATALOG_REQUIRED/);
  assert.doesNotThrow(() => assertBiancaClaims("Te dejo el catálogo: https://orbit.boom-box.cl/catalogo/novios", { catalogSent: true }));
  assert.deepEqual(unsupportedBiancaClaims("Tu cotización está lista y la reserva está iniciada", {}), ["QUOTE_CREATE_REQUIRED", "RESERVATION_START_REQUIRED"]);
});

test("tool registry exposes idempotency and permission contracts", () => {
  assert.ok(BIANCA_TOOL_NAMES.includes("SEND_CATALOG"));
  assert.equal(BIANCA_TOOL_REGISTRY.SEND_CATALOG.idempotent, true);
  assert.equal(BIANCA_TOOL_REGISTRY.QUOTE_CREATE.idempotent, false);
  assert.equal(BIANCA_TOOL_REGISTRY.HANDOFF.permission, "FOUNDER_ONLY");
});

test("intent engine supports multiple intents in one customer turn", () => {
  assert.deepEqual(detectBiancaIntents("Classic para matrimonio, ¿cuánto sale y está disponible?"), ["ASK_AVAILABILITY", "ASK_PRICE"]);
});
