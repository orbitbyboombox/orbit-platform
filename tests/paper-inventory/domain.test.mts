import assert from "node:assert/strict";
import test from "node:test";
import { applyPaperMovement, inventoryKey, UNCONFIRMED_WAREHOUSE_OPENING, type PaperMovement } from "../../src/lib/paper-inventory/domain.ts";

const base: PaperMovement = {
  id: "m1", idempotencyKey: "m1", format: "4x6_normal",
  kind: "transfer", quantity: 700, from: "warehouse", to: "box:2",
  occurredAt: "2026-10-09T12:00:00Z",
};

test("opening count is accurate and format remains unconfirmed", () => {
  assert.equal((UNCONFIRMED_WAREHOUSE_OPENING.purchasedBoxes + UNCONFIRMED_WAREHOUSE_OPENING.additionalBoxes) * 1400 + 700, 18900);
  assert.equal(UNCONFIRMED_WAREHOUSE_OPENING.format, null);
});

test("transfer moves stock without creating or destroying it", () => {
  const result = applyPaperMovement({ [inventoryKey("warehouse", base.format)]: 1400 }, base, new Set());
  assert.equal(result[inventoryKey("warehouse", base.format)], 700);
  assert.equal(result[inventoryKey("box:2", base.format)], 700);
});

test("idempotent retry does not deduct stock again", () => {
  const initial = { [inventoryKey("warehouse", base.format)]: 700 };
  assert.deepEqual(applyPaperMovement(initial, base, new Set(["m1"])), initial);
});

test("rejects overdraft, fractional quantity and missing event for consumption", () => {
  assert.throws(() => applyPaperMovement({}, base, new Set()), /Insufficient/);
  assert.throws(() => applyPaperMovement({}, { ...base, quantity: 0.5 }, new Set()), /positive integer/);
  assert.throws(() => applyPaperMovement({}, { ...base, kind: "consumption", to: undefined }, new Set()), /event/);
});
