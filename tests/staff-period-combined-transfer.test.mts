import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261116193000_staff_period_combined_transfer.sql",
  "utf8",
);
const postCloseMigration = readFileSync(
  "supabase/migrations/20261116203000_staff_period_transfer_after_close.sql",
  "utf8",
);
const guardMigration = readFileSync(
  "supabase/migrations/20261127190000_enforce_staff_finalized_realization_fields.sql",
  "utf8",
);
const action = readFileSync(
  "features/staff-monthly-account/payment-periods.actions.ts",
  "utf8",
);
const panel = readFileSync(
  "features/staff-monthly-account/payment-periods-panel.tsx",
  "utf8",
);

test("combined staff transfer keeps honoraria tax ledger separate from reimbursements", () => {
  assert.match(migration, /register_staff_period_transfer/);
  assert.match(migration, /register_staff_period_payment/);
  assert.match(migration, /staff_reimbursement_payments/);
  assert.match(migration, /withholdingAmount/);
  assert.match(migration, /p_total_amount - expected_reimbursements/);
  assert.match(migration, /reimbursement_key := 'staff-period-transfer:'/);
});

test("combined transfer is atomic and refuses a reused bank reference", () => {
  assert.match(migration, /for update of a/);
  assert.match(migration, /for update of e, submission/);
  assert.match(migration, /La referencia bancaria ya fue registrada/);
  assert.match(migration, /on conflict\(correlation_id\) do nothing/);
});

test("payment action uses the combined transfer RPC and the UI shows the cash total", () => {
  assert.match(action, /register_staff_period_transfer/);
  assert.match(action, /p_total_amount:\s*amount/);
  assert.doesNotMatch(action, /p_amount:\s*amount/);
  assert.match(panel, /reimbursementsPendingTotal/);
  assert.match(panel, /transferTotal/);
  assert.match(panel, /Monto total de transferencia/);
});

test("payment receipt remains mandatory and the tax withholding is not editable", () => {
  assert.match(action, /file\.arrayBuffer\(\)/);
  assert.match(action, /p_bucket: "orbit-documents"/);
  assert.match(panel, /name="file"/);
  assert.match(panel, /Se usará la validación tributaria documentada/);
});

test("post-close transfer re-enters the narrow payment guard for reimbursements", () => {
  assert.match(postCloseMigration, /period\.status <> 'FINALIZED'/);
  assert.match(postCloseMigration, /perform set_config\('orbit\.staff_period_payment', period\.id::text, true\)/);
  assert.match(postCloseMigration, /perform set_config\('orbit\.staff_period_payment', '', true\)/);
  assert.match(postCloseMigration, /exception when others then/);
  assert.match(postCloseMigration, /La referencia bancaria ya fue registrada/);
  assert.doesNotMatch(postCloseMigration, /update public\.staff_payment_periods/);
  assert.doesNotMatch(postCloseMigration, /final_transfer_amount/);
});

test("post-close settlement sync allows only the realization fields and version", () => {
  assert.match(guardMigration, /touch_versioned_row runs before this guard/);
  assert.match(guardMigration, /'paid_amount','paid_at','settlement_status','updated_at','updated_by','version'/);
  assert.match(guardMigration, /after_row - array\[[^\]]+\]\)\s+is not distinct from \(before_row - array\[/);
  assert.match(guardMigration, /El bloque Staff está cerrado y sus conceptos o movimientos están protegidos/);
  assert.doesNotMatch(guardMigration, /update public\.staff_payment_periods/);
  assert.doesNotMatch(guardMigration, /final_transfer_amount/);
  assert.doesNotMatch(guardMigration, /withholding_amount/);
});
