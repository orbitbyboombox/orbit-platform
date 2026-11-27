import assert from "node:assert/strict";
import test from "node:test";
import {
  invoicePaymentCashImpact,
  shouldIncludeStaffBlockCost,
  signedStaffMovement,
} from "../features/finance/canonical-cash-flow.ts";

test("pagos legítimos iguales se conservan y las devoluciones reducen caja", () => {
  assert.equal(invoicePaymentCashImpact("PARTIAL_PAYMENT", 100_000), 100_000);
  assert.equal(invoicePaymentCashImpact("PARTIAL_PAYMENT", 100_000), 100_000);
  assert.equal(invoicePaymentCashImpact("RETURN_COMPLETED", 25_000), -25_000);
  assert.equal(invoicePaymentCashImpact("VOIDED", 100_000), 0);
});

test("la reversa de Staff tiene impacto negativo y no se descarta", () => {
  assert.equal(signedStaffMovement({
    id: "reversal",
    settlement_id: "settlement",
    movement_type: "REVERSAL",
    amount: 40_000,
    movement_date: "2026-11-27",
  }), -40_000);
  assert.equal(signedStaffMovement({
    id: "payment",
    settlement_id: "settlement",
    movement_type: "PAYMENT",
    amount: 40_000,
    movement_date: "2026-11-27",
  }), 40_000);
});

test("un costo por bloque con liquidación canónica no se duplica", () => {
  assert.equal(shouldIncludeStaffBlockCost("settlement-1", new Set(["settlement-1"])), false);
  assert.equal(shouldIncludeStaffBlockCost("settlement-2", new Set(["settlement-1"])), true);
  assert.equal(shouldIncludeStaffBlockCost(null, new Set(["settlement-1"])), true);
});
