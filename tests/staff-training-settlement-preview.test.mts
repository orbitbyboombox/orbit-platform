import assert from "node:assert/strict";
import test from "node:test";
import { trainingSettlementPreview } from "../lib/staff-training-settlement-preview.ts";

test("only completed training contributes to projected settlement", () => {
  const preview = trainingSettlementPreview([
    { id: "a", status: "COMPLETED", trainingAmountClp: 6000 },
    { id: "b", status: "PLANNED", trainingAmountClp: 7500 },
    { id: "c", status: "CANCELLED", trainingAmountClp: 6000 },
  ]);
  assert.deepEqual(preview, { completedCount: 1, pendingCount: 1, cancelledCount: 1, payableClp: 6000 });
});
test("invalid completed payment fails closed", () => {
  assert.throws(() => trainingSettlementPreview([{ id: "x", status: "COMPLETED", trainingAmountClp: -1 }]));
});
