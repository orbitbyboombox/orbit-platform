import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260928080000_staff_financial_audit_and_close_guard.sql",
  "utf8",
);
const actions = readFileSync("features/staff-payments/actions.ts", "utf8");

test("pre-close audit is canonical and blocks financial RED findings", () => {
  assert.match(migration, /staff_month_financial_audit/);
  assert.match(migration, /event_staff_payments/);
  assert.match(migration, /event_staff_settlement_movements/);
  assert.match(migration, /staff_reimbursement_payments/);
  assert.match(migration, /SETTLEMENT_IN_FINALIZED_OTHER_PERIOD/);
  assert.match(migration, /DUPLICATE_REIMBURSEMENT/);
  assert.match(migration, /FINAL_TRANSFER_MISMATCH/);
  assert.match(migration, /monthCloseCanProceed/);
});

test("monthly close audits before generating accounts or sending communications", () => {
  const close = actions.slice(actions.indexOf("export async function closeStaffMonthAction"));
  assert.ok(close.indexOf('staff_month_financial_audit') < close.indexOf('generate_staff_monthly_accounts'));
  assert.match(close, /criticalErrorCount/);
  assert.match(close, /sendMonthlySettlementReadyEmail/);
});

test("audit distinguishes independent assignments from duplicate settlements", () => {
  const repair = readFileSync(
    "supabase/migrations/20261102130000_staff_month_audit_assignment_and_paid_reconciliation.sql",
    "utf8",
  );
  assert.match(repair, /group by payment\.staff_id,payment\.project_id,payment\.assignment_id/);
  assert.match(repair, /misma asignaci/);
  assert.match(repair, /payment\.assignment_id is not null/);
});

test("audit preserves historical paid transfers and blocks unpaid reimbursements", () => {
  const repair = readFileSync(
    "supabase/migrations/20261102130000_staff_month_audit_assignment_and_paid_reconciliation.sql",
    "utf8",
  );
  assert.match(repair, /payment_status in \('PAID','FINALIZED'\)/);
  assert.match(repair, /PENDING_REIMBURSEMENT/);
  assert.match(repair, /reimbursementsPendingTotal/);
});
