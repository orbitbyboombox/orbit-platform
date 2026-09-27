import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260927150000_staff_finance_reconciliation.sql", import.meta.url), "utf8");

test("monthly work base uses the active event payment ledger", () => {
  assert.match(migration, /settlement\.accounting_month=month_start/);
  assert.match(migration, /sum\(settlement\.total_internal_payment\)/);
  assert.doesNotMatch(migration, /sum\(financial\.payroll_net\)/);
});

test("advances remain cash-transfer deductions, not boleta deductions", () => {
  assert.match(migration, /'boletaNet',work_total/);
  assert.match(migration, /final_transfer:=greatest\(cash_obligation-advances,0\)/);
  assert.match(migration, /'reimbursementsTotal',reimbursement_total/);
});

test("paid accounts cannot remain draft", () => {
  assert.match(migration, /payment_status='PAID' and settlement_status='DRAFT'/);
  assert.match(migration, /payment_status<>'PAID' or settlement_status='FINALIZED'/);
  assert.match(migration, /Reparación auditada/);
});
