import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260928050000_staff_finance_canonical_reconciliation.sql", "utf8");

test("monthly work obligation is sourced from accounting-month event payments", () => {
  assert.match(migration, /settlement\.accounting_month=month_start/);
  assert.match(migration, /sum\(settlement\.total_internal_payment\)/);
  assert.match(migration, /'periodSource','ACCOUNTING_MONTH'/);
});

test("final transfer uses per-event pending work and pending reimbursements", () => {
  assert.match(migration, /'workPending'/);
  assert.match(migration, /'reimbursementsPending'/);
  assert.match(migration, /cash_obligation:=work_pending\+reimbursement_pending/);
  assert.match(migration, /final_transfer:=greatest\(cash_obligation,0\)/);
});

test("boleta base is independent from advances and payments", () => {
  assert.match(migration, /'boletaNet',work_total/);
  assert.match(migration, /gross_amount:=round\(work_total\/\(1-rate\),0\)/);
});

test("historical overpayments are reviewable and future overpayments are blocked", () => {
  assert.match(migration, /'workOverpayment'/);
  assert.match(migration, /'reimbursementOverpayment'/);
  assert.match(migration, /using errcode='23514'/);
  assert.match(migration, /excede el saldo de trabajo pendiente/);
});

test("september repair only rewrites the derived monthly read model", () => {
  assert.match(migration, /accounting_month='2026-09-01'/);
  assert.match(migration, /RECONCILED_CANONICAL_LEDGER/);
  assert.doesNotMatch(migration, /delete from public\.(event_staff_payments|event_staff_settlement_movements|staff_reimbursement_payments)/);
});
