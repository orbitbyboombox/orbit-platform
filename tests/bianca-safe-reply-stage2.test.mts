import assert from "node:assert/strict";
import test from "node:test";
import { biancaAutomationRouting, evaluateBiancaSafeReply, isActiveHumanTakeover, resolveCanonicalBiancaSafeReplyEvidence } from "../features/connectors/whatsapp-cloud/bianca-safe-reply.ts";
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
  assert.equal(claim.handoffRequired, false);
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

test("services question resolves canonical catalog evidence and queues the safe WhatsApp reply", async () => {
  process.env.BIANCA_STAGE = "SAFE_REPLY";
  process.env.WHATSAPP_REAL_RESPONSE = "ON";
  process.env.BIANCA_SHADOW_MODE = "false";
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
  const client = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: { id: "doc-1", version: 3, status: "ACTIVE", category: "EVENTS" }, error: null }),
      };
    },
  } as never;
  const catalogDecision = decision({ requestedAction: "CATALOG_LOOKUP", catalogCategory: "EVENTS" });
  const evidence = await resolveCanonicalBiancaSafeReplyEvidence({ client, decision: catalogDecision, messageText: "Hola, ¿qué servicios tienen?" });
  assert.deepEqual(evidence, { verified: true, kind: "CANONICAL_CATALOG", sourceRef: "https://orbit.boom-box.cl/catalogo/eventos" });
  const response = `Sí 😊 Te dejo nuestro catálogo: ${evidence.sourceRef}`;
  const evaluation = evaluateBiancaSafeReply({ decision: catalogDecision, response, confidence: 0.99, evidence, claimViolations: [] });
  assert.equal(evaluation.allowed, true);
  const outbox: Array<{ content: string; channel: "WHATSAPP_BUSINESS" }> = [];
  if (evaluation.allowed) outbox.push({ channel: "WHATSAPP_BUSINESS", content: response });
  assert.equal(outbox[0]?.content, response);
});

test("catalog adapter failure leaves evidence unverified and sends nothing", async () => {
  process.env.BIANCA_STAGE = "SAFE_REPLY";
  process.env.WHATSAPP_REAL_RESPONSE = "ON";
  process.env.BIANCA_SHADOW_MODE = "false";
  process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";
  const client = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: null, error: new Error("catalog unavailable") }),
      };
    },
  } as never;
  const catalogDecision = decision({ requestedAction: "CATALOG_LOOKUP", catalogCategory: "EVENTS" });
  const evidence = await resolveCanonicalBiancaSafeReplyEvidence({ client, decision: catalogDecision, messageText: "Hola, ¿qué servicios tienen?" });
  const evaluation = evaluateBiancaSafeReply({ decision: catalogDecision, response: "Te dejo el catálogo", confidence: 0.99, evidence, claimViolations: [] });
  assert.equal(evidence.verified, false);
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.reason, "CANONICAL_EVIDENCE_REQUIRED");
});

test("SAFE_REPLY routes with global automation OFF and keeps side-effect flags closed", () => {
  const routing = biancaAutomationRouting({ shadowMode: false, safeReplyMode: true, globalAutomationEnabled: false, qaAuthorized: false });
  assert.equal(routing.initialAutomationEnabled, true);
  assert.equal(routing.automationEnabled, true);
  assert.equal(process.env.GLOBAL_AUTOMATION ?? "false", "false");
});

test("Shadow routing never opens outbound processing", () => {
  const routing = biancaAutomationRouting({ shadowMode: true, safeReplyMode: false, globalAutomationEnabled: false, qaAuthorized: false });
  assert.equal(routing.initialAutomationEnabled, true);
  assert.equal(routing.automationEnabled, false);
  const outbox: string[] = [];
  if (!routing.automationEnabled) outbox.push("NO_OUTBOUND");
  assert.deepEqual(outbox, ["NO_OUTBOUND"]);
});

test("stale HUMAN_HANDOFF state is recoverable when no human takeover is active", () => {
  const stale = { status: "HUMAN_HANDOFF", nova_enabled: false, human_owner_id: null, context: { humanTakeover: { active: false } } };
  assert.equal(isActiveHumanTakeover(stale), false);
});

test("active human takeover remains a hard suppression boundary", () => {
  const active = { status: "HUMAN_HANDOFF", nova_enabled: false, human_owner_id: "staff-1", context: { humanTakeover: { active: true } } };
  assert.equal(isActiveHumanTakeover(active), true);
});

test("historical handoff can recover the catalog safe-reply path without manual DB mutation", async () => {
  const historical = { status: "HUMAN_HANDOFF", nova_enabled: false, human_owner_id: null, context: { humanTakeover: { active: false } } };
  assert.equal(isActiveHumanTakeover(historical), false);
  const catalogDecision = decision({ requestedAction: "CATALOG_LOOKUP", catalogCategory: "EVENTS" });
  const evidence = { verified: true as const, kind: "CANONICAL_CATALOG" as const, sourceRef: "https://orbit.boom-box.cl/catalogo/eventos" };
  const evaluation = evaluateBiancaSafeReply({ decision: catalogDecision, response: `Sí 😊 Te dejo nuestro catálogo: ${evidence.sourceRef}`, confidence: 0.99, evidence, claimViolations: [] });
  assert.equal(evaluation.allowed, true);
  assert.equal(evaluation.handoffRequired, false);
  assert.equal(evaluation.guardDecisions.evidenceAllowed, true);
});
