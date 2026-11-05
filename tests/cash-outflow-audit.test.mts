import assert from "node:assert/strict";
import test from "node:test";
import { auditCashOutflow } from "../features/finance/cash-outflow-audit.ts";

test("recorded disbursement is never misrepresented as bank-confirmed", () => {
  const result = auditCashOutflow([{ source: "staff_reimbursement_payments", id: "a", amount: 15000, paidOn: "2026-11-02", expenseId: "expense-a" }]);
  assert.equal(result.recordedPayments, 15000);
  assert.equal(result.bankConfirmed, 0);
  assert.equal(result.pendingBankConfirmation, 15000);
});
test("every duplicate payment ID is excluded, not only the second", () => {
  const row = { source: "office_lease_payments" as const, id: "duplicate", amount: 90000, paidOn: "2026-11-02" };
  const result = auditCashOutflow([row, row]);
  assert.equal(result.recordedPayments, 0);
  assert.equal(result.reviewCount, 2);
});
test("unlinked reimbursements, negative amounts and undated payments fail closed", () => {
  const result = auditCashOutflow([
    { source: "staff_reimbursement_payments", id: "a", amount: 2000, paidOn: "2026-11-02" },
    { source: "office_lease_payments", id: "b", amount: -1, paidOn: "2026-11-02" },
    { source: "office_lease_payments", id: "c", amount: 3000, paidOn: null },
  ]);
  assert.equal(result.recordedPayments, 0);
  assert.equal(result.reviewCount, 3);
});
