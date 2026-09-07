import test from "node:test";
import assert from "node:assert/strict";
import { getBiancaOperationalStatus } from "../features/bianca-workspace/bianca-status.ts";

test("BIANCA workspace remains prepared while WhatsApp is disconnected", () => {
  assert.equal(getBiancaOperationalStatus({ whatsappConnected: false, active: 0, human: 0 }), "PREPARADA");
});

test("review-required conversations take priority over connected state", () => {
  assert.equal(getBiancaOperationalStatus({ whatsappConnected: true, active: 2, human: 1 }), "REQUIERE ATENCIÓN");
});

test("connected but explicitly gated BIANCA is paused", () => {
  const previous = {
    messaging: process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED,
    ai: process.env.BIANCA_AI_ENABLED,
    outbound: process.env.BIANCA_OUTBOUND_ENABLED,
  };
  process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED = "false";
  process.env.BIANCA_AI_ENABLED = "false";
  process.env.BIANCA_OUTBOUND_ENABLED = "false";
  assert.equal(getBiancaOperationalStatus({ whatsappConnected: true, active: 0, human: 0 }), "PAUSADA");
  for (const [key, value] of Object.entries({ BIANCA_CUSTOMER_MESSAGING_ENABLED: previous.messaging, BIANCA_AI_ENABLED: previous.ai, BIANCA_OUTBOUND_ENABLED: previous.outbound })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
