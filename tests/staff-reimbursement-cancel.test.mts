import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261008100000_admin_cancel_staff_reimbursement.sql",
  "utf8",
);
const action = readFileSync(
  "features/staff-expenses/staff-expense-review.actions.ts",
  "utf8",
);
const ui = readFileSync(
  "features/staff-payments/staff-payments-center.tsx",
  "utf8",
);

test("admin reimbursement cancellation is explicit, audited, and payment-safe", () => {
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /pg_catalog\.length\(pg_catalog\.btrim\(coalesce\(p_reason, ''\)\)\) < 3/);
  assert.match(migration, /status\s*=\s*'CANCELLED'/);
  assert.match(migration, /cancelled_at\s*=\s*pg_catalog\.now\(\)/);
  assert.match(migration, /cancellation_reason\s*=\s*pg_catalog\.btrim\(p_reason\)/);
  assert.match(migration, /from public\.staff_reimbursement_payments payment[\s\S]*payment\.staff_expense_submission_id\s*=\s*item\.id/);
  assert.match(migration, /STAFF_REIMBURSEMENT_CANCELLED/);
  assert.doesNotMatch(migration, /delete from public\.(staff_expense_submissions|expenses)/i);
});

test("Admin UI exposes real reimbursement detail and confirmation", () => {
  assert.match(action, /cancel_staff_expense_submission/);
  assert.match(ui, /Anular reembolso/);
  assert.match(ui, /Motivo obligatorio/);
  assert.match(ui, /Este reembolso dejará de formar parte del saldo pendiente/);
  assert.match(ui, /Estado: \{item\.status/);
  assert.match(ui, /Comprobante:/);
});
