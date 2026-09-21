import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBiancaSafeReply } from "../features/connectors/whatsapp-cloud/bianca-safe-reply.ts";
import type { WhatsAppAiDecision } from "../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts";

const baseDecision: WhatsAppAiDecision = {
  responseText: "Sí, te cuento cómo funciona.",
  commercialStage: "NEW_LEAD",
  intents: ["CONSULTA_GENERAL"],
  waitForMoreData: false,
  requestedAction: "NONE",
  catalogCategory: "NONE",
  fields: [],
  conversationSummary: "consulta general",
};

function decision(overrides: Partial<WhatsAppAiDecision> = {}): WhatsAppAiDecision {
  return { ...baseDecision, ...overrides, intents: overrides.intents ?? [...baseDecision.intents], fields: overrides.fields ?? [] };
}

test("SAFE_REPLY allows a high-confidence general read-only answer only when explicitly enabled", () => {
  process.env.BIANCA_STAGE = "SAFE_REPLY";
  process.env.WHATSAPP_REAL_RESPONSE = "ON";
  process.env.BIANCA_SHADOW_MODE = "false";
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
  const result = evaluateBiancaSafeReply({ decision: decision(), response: baseDecision.responseText, confidence: 0.95, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" } });
  assert.equal(result.allowed, true);
  assert.equal(result.guardDecisions.executionFlagsBlocked, true);
});

test("low confidence, missing evidence, claims and commercial side effects fail closed", () => {
  process.env.BIANCA_STAGE = "SAFE_REPLY";
  process.env.WHATSAPP_REAL_RESPONSE = "ON";
  process.env.BIANCA_SHADOW_MODE = "false";
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
  const low = evaluateBiancaSafeReply({ decision: decision(), response: "No estoy segura", confidence: 0.4, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" } });
  assert.equal(low.allowed, false);
  assert.equal(low.reason, "LOW_CONFIDENCE");
  const price = evaluateBiancaSafeReply({ decision: decision({ intents: ["CONSULTA_PRECIO"], requestedAction: "COMMERCIAL_LOOKUP" }), response: "$100", confidence: 0.95, evidence: { verified: false, kind: "NONE" } });
  assert.equal(price.reason, "CANONICAL_EVIDENCE_REQUIRED");
  const quote = evaluateBiancaSafeReply({ decision: decision({ intents: ["QUIERE_COTIZAR"] }), response: "Avancemos", confidence: 0.99, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" } });
  assert.equal(quote.reason, "HUMAN_HANDOFF_REQUIRED");
  const claim = evaluateBiancaSafeReply({ decision: decision(), response: "Te confirmo la reserva", confidence: 0.99, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, claimViolations: ["RESERVATION_START_REQUIRED"] });
  assert.equal(claim.reason, "UNSUPPORTED_CLAIM_BLOCKED");
});

test("catalog requires canonical catalog evidence and kill switch blocks all replies", () => {
  process.env.BIANCA_STAGE = "SAFE_REPLY";
  process.env.WHATSAPP_REAL_RESPONSE = "ON";
  process.env.BIANCA_SHADOW_MODE = "false";
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
  const catalog = evaluateBiancaSafeReply({ decision: decision({ requestedAction: "CATALOG_LOOKUP", catalogCategory: "EVENTS" }), response: "Te dejo el catálogo", confidence: 0.95, evidence: { verified: true, kind: "CANONICAL_CATALOG" } });
  assert.equal(catalog.allowed, true);
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "true";
  const blocked = evaluateBiancaSafeReply({ decision: decision(), response: baseDecision.responseText, confidence: 0.99, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" } });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "GLOBAL_KILL_SWITCH_ACTIVE");
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
});
