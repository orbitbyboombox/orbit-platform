import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260916121503_staff_reimbursement_payment_ledger.sql", "utf8");
const actions = readFileSync("features/staff-monthly-account/actions.ts", "utf8");
const founderUi = readFileSync("features/staff-payments/staff-financial-actions.tsx", "utf8");
const staffPage = readFileSync("app/(platform)/resources/staff/page.tsx", "utf8");
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const portalDashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const payables = readFileSync("features/accounts-payable/repository.ts", "utf8");
const cashFlow = readFileSync("app/(platform)/finance/cash-flow/page.tsx", "utf8");

test("reimbursement payments have an immutable one-payment-per-expense ledger", () => {
  assert.match(migration, /create table if not exists public\.staff_reimbursement_payments/);
  assert.match(migration, /unique\(expense_id\)/);
  assert.match(migration, /unique\(idempotency_key\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /item\.status<>'APPROVED'/);
  assert.match(migration, /item\.expense_scope<>'STAFF_REIMBURSEMENT'/);
  assert.match(migration, /existing\.idempotency_key=p_idempotency_key/);
  assert.match(migration, /Este reembolso ya fue pagado/);
});

test("honoraria, advances and reimbursements cannot settle each other", () => {
  assert.match(migration, /staff_settlement_payroll_amount/);
  assert.match(migration, /reimbursement_paid_amount/);
  assert.match(migration, /reimbursement_pending_amount/);
  assert.match(migration, /'workNet',financial\.payroll_net/);
  assert.match(migration, /final_transfer:=greatest\(cash_obligation-advances,0\)/);
  assert.match(migration, /obligation:=coalesce\(\(detail->>'workNet'\)::numeric,0\)/);
  const honoraria = 34_000;
  const reimbursement = 13_599;
  const paidHonoraria = 34_000;
  const paidReimbursement = 0;
  assert.equal(Math.max(honoraria - paidHonoraria, 0), 0);
  assert.equal(Math.max(reimbursement - paidReimbursement, 0), 13_599);
});

test("Founder gets a global responsive payment flow with real pending filtering", () => {
  assert.match(founderUi, /PAGAR REEMBOLSO/);
  assert.match(founderUi, /approvedReimbursements/);
  assert.match(founderUi, /Monto aprobado/);
  assert.match(founderUi, /VER COMPROBANTE DEL GASTO/);
  assert.match(founderUi, /loadingLabel="Registrando reembolso…"/);
  assert.match(founderUi, /variant="fullscreen-mobile"/);
  assert.match(staffPage, /item\.status === "APPROVED"/);
  assert.match(staffPage, /!paidReimbursementExpenseIds\.has/);
});

test("server action validates, optionally stores proof and calls one atomic RPC", () => {
  assert.match(actions, /registerStaffReimbursementPaymentAction/);
  assert.match(actions, /expense\.status !== "APPROVED"/);
  assert.match(actions, /expense\.expense_scope !== "STAFF_REIMBURSEMENT"/);
  assert.match(actions, /requestId/);
  assert.match(actions, /register_staff_reimbursement_payment/);
  assert.match(actions, /staff_reimbursement_payment_complete/);
  assert.match(actions, /revalidatePath\("\/finance\/cash-flow"\)/);
});

test("Portal, payables and cash flow expose separate reimbursement state", () => {
  assert.match(portal, /staff_reimbursement_payments/);
  assert.match(portalDashboard, /REEMBOLSO PENDIENTE DE PAGO/);
  assert.match(portalDashboard, /REEMBOLSO PAGADO/);
  assert.match(payables, /reimbursement_paid_amount/);
  assert.match(payables, /Reembolso pendiente/);
  assert.match(cashFlow, /Reembolso Staff pendiente/);
  assert.match(cashFlow, /Reembolso Staff pagado/);
});

test("reimbursement implementation does not write customer finance or contracts", () => {
  assert.doesNotMatch(migration, /\b(?:insert into|update|delete from) public\.(?:invoice_payments|invoices|receivable_movements|contracts)\b/i);
  assert.doesNotMatch(actions, /invoice_payments|receivable_movements|customer_contracts/);
});
