import assert from "node:assert/strict";
import test from "node:test";
import { allowedBiancaTransitions, transitionBiancaStage } from "../features/connectors/whatsapp-cloud/bianca-sales-state-machine.ts";
import { actionRunIdempotencyKey } from "../features/connectors/whatsapp-cloud/bianca-action-runs.ts";
import { prepareBiancaOpportunityContext } from "../features/connectors/whatsapp-cloud/bianca-opportunity-context.ts";

test("commercial state machine accepts the canonical quote to reservation path", () => {
  const quote = transitionBiancaStage({ from: "PRICING_READY", to: "QUOTING", reason: "quote action requested", source: "ACTION" });
  const sent = transitionBiancaStage({ from: quote.to, to: "QUOTE_SENT", reason: "quote sent", source: "ACTION" });
  const intent = transitionBiancaStage({ from: sent.to, to: "RESERVATION_INTENT", reason: "customer wants to reserve", source: "CUSTOMER" });
  assert.equal(intent.to, "RESERVATION_INTENT");
  assert.ok(allowedBiancaTransitions("RESERVATION_INTENT").includes("RESERVATION_STARTED"));
});

test("commercial state machine blocks incoherent jumps", () => {
  assert.throws(() => transitionBiancaStage({ from: "NEW_LEAD", to: "CLOSED_WON", reason: "unsafe shortcut", source: "ACTION" }), /BIANCA_INVALID_STAGE_TRANSITION/);
});

test("action idempotency key includes conversation, opportunity and normalized input", () => {
  const key = actionRunIdempotencyKey({ customerId: "c", conversationId: "cv", opportunityId: "op", actionType: "QUOTE_CREATE", inputSummary: {}, normalizedInputHash: "abc" });
  assert.equal(key, "bianca:cv:op:QUOTE_CREATE:abc");
});

test("active opportunity gets a stable identity and resets for a new quote", () => {
  const first = prepareBiancaOpportunityContext({}, "hola", "2026-09-20T00:00:00.000Z");
  const same = prepareBiancaOpportunityContext(first.context, "quiero reservar", "2026-09-20T00:01:00.000Z");
  const next = prepareBiancaOpportunityContext(first.context, "quiero cotizar otro evento", "2026-09-20T00:02:00.000Z");
  assert.equal(same.context.activeOpportunityId, first.context.activeOpportunityId);
  assert.notEqual(next.context.activeOpportunityId, first.context.activeOpportunityId);
});
