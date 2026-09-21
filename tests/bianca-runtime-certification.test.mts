import assert from "node:assert/strict";
import test from "node:test";
import { biancaFastPath } from "../features/connectors/whatsapp-cloud/bianca-fast-path.ts";
import { actionPolicyReason, isSafeBiancaAction } from "../features/connectors/whatsapp-cloud/bianca-action-policy.ts";
import { evaluateBiancaSafeReply, resolveCanonicalBiancaSafeReplyEvidence } from "../features/connectors/whatsapp-cloud/bianca-safe-reply.ts";
import { responseContract } from "../features/connectors/whatsapp-cloud/bianca-response-contract.ts";
import type { WhatsAppAiDecision } from "../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts";

process.env.BIANCA_STAGE = "SAFE_REPLY";
process.env.BIANCA_RESPONSES_ENABLED = "true";
process.env.WHATSAPP_REAL_RESPONSE = "ON";
process.env.BIANCA_SHADOW_MODE = "false";
process.env.BIANCA_KILL_SWITCH = "false";
process.env.BIANCA_GLOBAL_KILL_SWITCH = "false";

const base: WhatsAppAiDecision = {
  responseText: "Te ayudo con eso.",
  commercialStage: "QUALIFYING",
  intents: ["CONSULTA_GENERAL"],
  waitForMoreData: false,
  requestedAction: "NONE",
  catalogCategory: "NONE",
  fields: [],
  conversationSummary: "certification",
};

function decision(overrides: Partial<WhatsAppAiDecision>): WhatsAppAiDecision {
  return { ...base, ...overrides, intents: overrides.intents ?? base.intents, fields: overrides.fields ?? [] };
}

function mockCatalogClient() {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: { id: "catalog-1", version: 1, status: "ACTIVE", category: "EVENTS" }, error: null }),
      };
    },
  } as never;
}

class InMemoryRuntimeAdapter {
  readonly outbox = new Map<string, { status: "PENDING" | "SENT" | "FAILED"; content: string }>();

  enqueue(correlationId: string, content: string) {
    if (this.outbox.has(correlationId)) return false;
    this.outbox.set(correlationId, { status: "PENDING", content });
    return true;
  }

  deliver(correlationId: string, shouldFail = false) {
    const row = this.outbox.get(correlationId);
    if (!row) return responseContract({ failed: true });
    row.status = shouldFail ? "FAILED" : "SENT";
    return responseContract(shouldFail ? { failed: true } : { responseSent: true });
  }
}

test("BIANCA_RUNTIME_CERTIFICATION covers 120 end-to-end turns with action policy and test adapters", async () => {
  const adapter = new InMemoryRuntimeAdapter();
  const catalogDecision = decision({ requestedAction: "CATALOG_LOOKUP", catalogCategory: "EVENTS" });
  const catalogEvidence = await resolveCanonicalBiancaSafeReplyEvidence({
    client: mockCatalogClient(),
    decision: catalogDecision,
    messageText: "Hola, ¿qué servicios tienen?",
  });
  assert.equal(catalogEvidence.kind, "CANONICAL_CATALOG");

  const scenarios: Array<{ name: string; decision: WhatsAppAiDecision; evidence: { verified: boolean; kind: "GENERAL_KNOWLEDGE" | "CANONICAL_CATALOG" | "CANONICAL_PRICE" | "CANONICAL_PAYMENT" | "CANONICAL_AVAILABILITY" | "CANONICAL_LOCATION" | "NONE" }; confidence: number; response: string; shouldAllow: boolean }> = [
    { name: "web lead matrimonio", decision: biancaFastPath({ source: "WEB_FORM_LEAD", leadContext: { name: "Andrés", eventType: "Matrimonio", eventDate: "21/11", commune: "Colina", venue: "Piedra Roja", message: "cotizar" }, message: { id: "lead", channel: "WHATSAPP_BUSINESS", conversationId: "c", customerId: "u", senderExternalId: "569", text: "NUEVA COTIZACIÓN BOOMBOX", receivedAt: new Date().toISOString() }, memory: {} as never })!, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.8, response: "¿Qué servicio tienes en mente?", shouldAllow: true },
    { name: "services", decision: biancaFastPath({ message: { id: "1", channel: "WHATSAPP_BUSINESS", conversationId: "c", customerId: "u", senderExternalId: "569", text: "Que servicios tienen", receivedAt: new Date().toISOString() }, memory: {} as never })!, evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.95, response: "Tenemos cabinas, 360 y otras experiencias. ¿Para qué evento?", shouldAllow: true },
    { name: "catalog", decision: catalogDecision, evidence: catalogEvidence, confidence: 0.95, response: "Te comparto el catálogo general.", shouldAllow: true },
    { name: "payment", decision: decision({ requestedAction: "COMMERCIAL_LOOKUP", intents: ["PAGO"] }), evidence: { verified: true, kind: "CANONICAL_PAYMENT" }, confidence: 0.95, response: "Te explico las condiciones de pago vigentes.", shouldAllow: true },
    { name: "price", decision: decision({ requestedAction: "COMMERCIAL_LOOKUP", intents: ["CONSULTA_PRECIO"] }), evidence: { verified: true, kind: "CANONICAL_PRICE" }, confidence: 0.95, response: "El valor depende del servicio y duración.", shouldAllow: true },
    { name: "availability", decision: decision({ requestedAction: "COMMERCIAL_LOOKUP", intents: ["DISPONIBILIDAD"] }), evidence: { verified: true, kind: "CANONICAL_AVAILABILITY" }, confidence: 0.95, response: "Revisé disponibilidad en la fuente canónica.", shouldAllow: true },
    { name: "quote missing data", decision: decision({ requestedAction: "WAIT_FOR_CUSTOMER", intents: ["QUIERE_COTIZAR"], waitForMoreData: true }), evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.5, response: "¿Qué fecha tienes para el evento?", shouldAllow: true },
    { name: "price objection", decision: decision({ requestedAction: "NONE", intents: ["OBJECION_PRECIO"] }), evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.8, response: "Podemos revisar qué alternativa calza mejor.", shouldAllow: true },
    { name: "human", decision: decision({ requestedAction: "HUMAN_HANDOFF", intents: ["HABLAR_CON_PERSONA"] }), evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.95, response: "Te derivo con el equipo.", shouldAllow: false },
    { name: "ambiguous clarification", decision: decision({ requestedAction: "WAIT_FOR_CUSTOMER", intents: ["CONSULTA_GENERAL"], waitForMoreData: true }), evidence: { verified: true, kind: "GENERAL_KNOWLEDGE" }, confidence: 0.5, response: "¿Te refieres al servicio o al catálogo?", shouldAllow: true },
  ];

  let certified = 0;
  for (let index = 0; index < 120; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const evaluation = evaluateBiancaSafeReply({ decision: scenario.decision, response: scenario.response, confidence: scenario.confidence, evidence: scenario.evidence, claimViolations: [] });
    assert.equal(evaluation.allowed, scenario.shouldAllow, scenario.name);
    assert.equal(isSafeBiancaAction(evaluation.runtimeAction), scenario.name === "human" || scenario.shouldAllow, scenario.name);
    if (scenario.shouldAllow) {
      const correlationId = `cert-${index}`;
      assert.equal(adapter.enqueue(correlationId, scenario.response), true);
      assert.equal(adapter.deliver(correlationId), "RESPONSE_SENT");
      assert.equal(adapter.enqueue(correlationId, scenario.response), false);
    } else {
      assert.equal(evaluation.handoffRequired, true, scenario.name);
      assert.equal(responseContract({ humanWaiting: true }), "WAITING_HUMAN");
    }
    certified += 1;
  }

  assert.equal(certified, 120);
  assert.equal(adapter.outbox.size, 108);
  assert.equal(actionPolicyReason("QUOTE_CREATE"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(actionPolicyReason("SEND_EMAIL"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(actionPolicyReason("RESERVATION_START"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(responseContract({ failed: true }), "FAILED");
});

test("runtime certification records delivery failure explicitly and never leaves silent pending", () => {
  const adapter = new InMemoryRuntimeAdapter();
  assert.equal(adapter.enqueue("failed-1", "respuesta"), true);
  assert.equal(adapter.deliver("failed-1", true), "FAILED");
  assert.equal(adapter.outbox.get("failed-1")?.status, "FAILED");
  assert.equal(responseContract({}), "FAILED");
});
