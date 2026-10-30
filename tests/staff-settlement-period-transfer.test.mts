import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261030150000_staff_settlement_period_transfer.sql",
  "utf8",
);
const actions = readFileSync("features/staff-monthly-account/actions.ts", "utf8");
const panel = readFileSync(
  "features/staff-monthly-account/staff-monthly-account-panel.tsx",
  "utf8",
);

test("period transfer preserves the event month and uses an explicit audited target month", () => {
  assert.match(sql, /staff_settlement_period_transfers/);
  assert.match(sql, /target_month>source_month/);
  assert.match(sql, /register_staff_next_period_advance/);
  assert.match(sql, /sourceMonth/);
  assert.match(sql, /targetMonth/);
  assert.doesNotMatch(sql, /update public\.event_staff_payments\s+set[\s\S]*accounting_month/);
});

test("the transfer is idempotent and cannot reopen a finalized source month", () => {
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /staff-next-period:/);
  assert.match(sql, /source_account\.settlement_status<>'FINALIZED' or source_account\.payment_status<>'PAID'/);
  assert.match(sql, /target_account[\s\S]*settlement_status<>'FINALIZED'/);
});

test("implementation keeps reimbursements separate and exposes the controlled Founder action", () => {
  assert.match(sql, /reimbursementsPendingTotal/);
  assert.match(sql, /reimbursementsPaid/);
  assert.match(actions, /registerStaffNextPeriodAdvanceAction/);
  assert.match(actions, /register_staff_next_period_advance/);
  assert.match(panel, /ANTICIPAR Y PASAR AL MES SIGUIENTE/);
  assert.match(panel, /No se altera octubre/);
});
