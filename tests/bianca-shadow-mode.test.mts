import test from "node:test";
import assert from "node:assert/strict";
import { createBiancaShadowDecision, biancaSideEffectsAllowed } from "../features/connectors/whatsapp-cloud/bianca-shadow-mode.ts";

test("shadow mode records proposal and blocks all commercial side effects", () => {
  const decision = createBiancaShadowDecision({
    intent: "NEW_QUOTE",
    plan: { commercialStage: "QUOTING", intent: "NEW_QUOTE", intents: ["NEW_QUOTE"], leadIntent: "HIGH", missing: [], nextBestAction: "OFFER_QUOTE" },
    proposedResponse: "Prepararía una cotización para revisión humana.",
    recordedAt: "2026-09-21T00:00:00.000Z",
  });
  assert.equal(decision.mode, "SHADOW");
  assert.deepEqual(decision.blockedSideEffects, ["SEND_EMAIL", "QUOTE_CREATE", "RESERVATION_START"]);
  assert.equal(decision.proposedAction, "OFFER_QUOTE");
});

test("global kill switch is fail-closed", () => {
  const previous = process.env.BIANCA_GLOBAL_KILL_SWITCH;
  delete process.env.BIANCA_GLOBAL_KILL_SWITCH;
  assert.equal(biancaSideEffectsAllowed(), false);
  if (previous === undefined) delete process.env.BIANCA_GLOBAL_KILL_SWITCH;
  else process.env.BIANCA_GLOBAL_KILL_SWITCH = previous;
});
