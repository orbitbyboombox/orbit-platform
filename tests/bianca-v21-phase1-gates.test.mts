import assert from "node:assert/strict";
import test from "node:test";
import { actionPolicyReason } from "../features/connectors/whatsapp-cloud/bianca-action-policy.ts";
import { biancaSideEffectsAllowed } from "../features/connectors/whatsapp-cloud/bianca-shadow-mode.ts";
import { biancaSafeReplyConfiguration } from "../features/connectors/whatsapp-cloud/bianca-safe-reply.ts";

test("V2.1 Phase 1 keeps every commercial side effect blocked by default", () => {
  const previous = {
    killSwitch: process.env.BIANCA_GLOBAL_KILL_SWITCH,
    shadow: process.env.BIANCA_SHADOW_MODE,
    stage: process.env.BIANCA_STAGE,
    response: process.env.BIANCA_RESPONSES_ENABLED,
  };
  delete process.env.BIANCA_GLOBAL_KILL_SWITCH;
  delete process.env.BIANCA_SHADOW_MODE;
  delete process.env.BIANCA_STAGE;
  delete process.env.BIANCA_RESPONSES_ENABLED;

  assert.equal(actionPolicyReason("QUOTE_CREATE"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(actionPolicyReason("SEND_EMAIL"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(actionPolicyReason("RESERVATION_START"), "SIDE_EFFECT_ACTION_DISABLED");
  assert.equal(biancaSideEffectsAllowed(), false);
  assert.equal(biancaSafeReplyConfiguration().sideEffectToolsEnabled, false);

  for (const [key, value] of Object.entries({
    BIANCA_GLOBAL_KILL_SWITCH: previous.killSwitch,
    BIANCA_SHADOW_MODE: previous.shadow,
    BIANCA_STAGE: previous.stage,
    BIANCA_RESPONSES_ENABLED: previous.response,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
