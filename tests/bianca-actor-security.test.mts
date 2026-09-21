import assert from "node:assert/strict";
import test from "node:test";
import { allowedBiancaActions, assertBiancaActionAuthorized, biancaSystemActor, canSystemActorPerform } from "../features/connectors/whatsapp-cloud/bianca-actor-context.ts";

test("BIANCA has an explicit technical actor identity", () => {
  const actor = biancaSystemActor();
  assert.deepEqual(actor, { actorType: "SYSTEM_AGENT", actorId: "BIANCA", source: "WHATSAPP_AGENT" });
  assert.equal(canSystemActorPerform("QUOTE_CREATE", actor), true);
});

test("BIANCA authorization is default-deny outside the allowlist", () => {
  const actor = biancaSystemActor();
  assert.deepEqual(allowedBiancaActions().sort(), ["QUOTE_CREATE", "RESERVATION_START", "SEND_EMAIL"]);
  for (const action of ["DELETE_QUOTE", "MODIFY_PRICE", "ADMIN", "DELETE_CUSTOMER"]) {
    assert.equal(canSystemActorPerform(action, actor), false);
    assert.throws(() => assertBiancaActionAuthorized(action, actor), /BIANCA_ACTION_DENIED/);
  }
});

test("service role alone is not a BIANCA actor context", () => {
  assert.equal(canSystemActorPerform("QUOTE_CREATE", { actorType: "SYSTEM_AGENT", actorId: "BIANCA", source: "FOUNDER_UI" }), false);
  assert.equal(canSystemActorPerform("QUOTE_CREATE", { actorType: "HUMAN", actorId: "HUMAN_USER", source: "FOUNDER_UI" }), false);
});
