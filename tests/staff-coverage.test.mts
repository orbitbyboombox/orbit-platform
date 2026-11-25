import test from "node:test";
import assert from "node:assert/strict";
import { coverageSummary, normalizeCoverageUnits, unitSubtotal } from "../features/staff-assignment-center/staff-coverage.ts";

test("normaliza cobertura y limita al número de tótems", () => {
  for (const total of [1, 2, 3, 4, 7]) {
    assert.equal(normalizeCoverageUnits(total + 2, total), total);
    assert.equal(normalizeCoverageUnits(0, total), 1);
  }
});

test("permite distribuir unidades y muestra pendientes", () => {
  assert.deepEqual(coverageSummary(7, [3, 2]), { required: 7, covered: 5, pending: 2, complete: false });
  assert.deepEqual(coverageSummary(4, [2, 2]), { required: 4, covered: 4, pending: 0, complete: true });
});

test("calcula subtotal proporcional sin duplicar tarifa total", () => {
  assert.equal(unitSubtotal(2, 20000, 2), 20000);
  assert.equal(unitSubtotal(1, 20000, 2), 10000);
});
