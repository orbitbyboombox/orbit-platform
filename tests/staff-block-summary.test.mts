import test from "node:test";
import assert from "node:assert/strict";
import { buildOperatorBlockSummary } from "../features/staff-assignment-center/staff-block-summary.ts";

test("consolida operadores por bloque sin duplicar asignaciones", () => {
  const result = buildOperatorBlockSummary(
    [
      { blockId: "am", required: 7, assigned: 1, rate: 32_500 },
      { blockId: "pm", required: 7, assigned: 1, rate: 32_500 },
    ],
    [
      { blockId: "am", staffId: "a", role: "OPERATOR", status: "ASSIGNED" },
      { blockId: "am", staffId: "a", role: "OPERATOR", status: "ASSIGNED" },
      { blockId: "pm", staffId: "b", role: "OPERATOR", status: "ASSIGNED" },
      { blockId: "pm", staffId: "cancelled", role: "OPERATOR", status: "CANCELLED" },
    ],
    [],
  );
  assert.deepEqual(
    { assigned: result.totalAssigned, required: result.totalRequired, pending: result.pending },
    { assigned: 2, required: 14, pending: 12 },
  );
  assert.equal(result.currentCost, 65_000);
  assert.equal(result.projectedCost, 455_000);
});

test("separa operadores generales sin bloque del consolidado", () => {
  const result = buildOperatorBlockSummary(
    [{ blockId: "am", required: 7, assigned: 0, rate: 32_500 }],
    [{ blockId: null, staffId: "general", role: "OPERATOR", status: "ASSIGNED" }],
    [],
  );
  assert.equal(result.totalAssigned, 0);
  assert.equal(result.unscopedAssigned, 1);
});
