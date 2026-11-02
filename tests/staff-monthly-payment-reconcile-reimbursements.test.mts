import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  "supabase/migrations/20261102180000_staff_monthly_payment_reconcile_reimbursements.sql",
  "utf8",
);

test("reconciles reimbursement cash without allocating it as honorarium", () => {
  assert.match(sql, /current_calc := public\.calculate_staff_monthly_settlement/);
  assert.match(sql, /reimbursement_paid_since_snapshot/);
  assert.match(sql, /expected_cash := work_remaining \+ reimbursement_paid_since_snapshot \+ reimbursement_pending/);
  assert.match(sql, /remaining := least\(greatest\(obligation - advance, 0\), work_remaining - allocated_work\)/);
  assert.match(sql, /if allocated_work <> work_remaining then/);
});

test("keeps account-level idempotency and does not insert reimbursement payments", () => {
  assert.match(sql, /if item\.payment_status = 'PAID'/);
  assert.match(sql, /item\.payment_idempotency_key = p_idempotency_key/);
  assert.doesNotMatch(sql, /insert into public\.staff_reimbursement_payments/);
});

test("preserves the existing Founder/Admin and approved-boleta guards", () => {
  assert.match(sql, /public\.can_administer\(\)/);
  assert.match(sql, /item\.boleta_status <> 'APPROVED'/);
  assert.match(sql, /item\.settlement_status <> 'FINALIZED'/);
});
