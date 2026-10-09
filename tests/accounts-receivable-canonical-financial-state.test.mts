import test from "node:test";
import assert from "node:assert/strict";
import { actualPaidAmount, effectiveReceivableStatus, scheduleDueDate } from "../features/accounts-receivable/canonical-financial-state.ts";

test("uses payment_schedule dueDate instead of the invoice status text", () => {
  assert.equal(scheduleDueDate([{ dueDate: "2026-11-05", status: "PENDING" }], "2026-01-01"), "2026-11-05");
  assert.equal(effectiveReceivableStatus({ amount: 714000, paidAmount: 0, dueDate: "2026-09-28", recordedStatus: "PENDING", today: "2026-10-09" }), "OVERDUE");
});

test("calculates the partial balance from registered payments", () => {
  const paid = actualPaidAmount(288576, [{ amount: 200000 }, { amount: 88576 }]);
  assert.equal(paid, 288576);
  assert.equal(577150 - paid, 288574);
  assert.equal(effectiveReceivableStatus({ amount: 577150, paidAmount: paid, dueDate: "2026-11-21", recordedStatus: "PARTIALLY_PAID", today: "2026-10-09" }), "PARTIALLY_PAID");
});

test("does not duplicate an empty payment ledger", () => {
  assert.equal(actualPaidAmount(0, []), 0);
  assert.equal(actualPaidAmount(1904000, []), 1904000);
});

