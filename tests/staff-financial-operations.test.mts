import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { founderActionHref, isFounderActionVisible } from "../features/founder-action-center/visibility.ts";

const staffPage = readFileSync("app/(platform)/resources/staff/page.tsx", "utf8");
const financialActions = readFileSync("features/staff-payments/staff-financial-actions.tsx", "utf8");
const advanceAction = readFileSync("features/staff-monthly-account/actions.ts", "utf8");
const review = readFileSync("features/staff-expenses/staff-expense-review.tsx", "utf8");
const reviewAction = readFileSync("features/staff-expenses/staff-expense-review.actions.ts", "utf8");
const dashboard = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");
const guard = readFileSync("supabase/migrations/20260916093123_staff_advance_balance_guard.sql", "utf8");
const reviewProjection = readFileSync("supabase/migrations/20260916093154_staff_expense_review_projection.sql", "utf8");

test("Staff expenses remain visible after the commercial pipeline is won", () => {
  assert.equal(isFounderActionVisible("STAFF_EXPENSE_REVIEW_REQUIRED", "GANADO"), true);
  assert.equal(isFounderActionVisible("SALES_LEAD_UNATTENDED", "GANADO"), false);
  assert.equal(isFounderActionVisible("SALES_LEAD_UNATTENDED", "EN_SEGUIMIENTO"), true);
});

test("expense alerts open the global Staff review queue", () => {
  assert.equal(founderActionHref("STAFF_EXPENSE_REVIEW_REQUIRED", "expense-1", "/old"), "/resources/staff?reviewExpense=expense-1");
  assert.match(staffPage, /reviewExpense/);
  assert.match(staffPage, /pendingExpenseItems/);
});

test("Founder and Staff surfaces expose the required operational access", () => {
  assert.match(financialActions, /INGRESAR PAGO POR ADELANTADO/);
  assert.match(financialActions, /GASTOS PENDIENTES/);
  assert.match(dashboard, /Pendientes por revisar/);
  assert.match(dashboard, /<details/);
});

test("advance form filters canonical events by collaborator and pending balance", () => {
  assert.match(financialActions, /events\.filter\(\(event\) => event\.staffId === staffId/);
  assert.match(financialActions, /event\.payrollNet - event\.payrollPaidAmount/);
  for (const field of ["settlementId", "amount", "date", "method", "notes", "receipt", "boleta"]) {
    assert.match(financialActions, new RegExp(`name=\\"${field}\\"`));
  }
});

test("advance remains a single idempotent canonical settlement mutation", () => {
  assert.match(advanceAction, /register_staff_advance_with_documents/);
  assert.match(advanceAction, /idempotencyKey/);
  assert.match(advanceAction, /result\.idempotent/);
  assert.doesNotMatch(financialActions, /staff_payment_months|legacy/i);
});

test("advance balance guard serializes and prevents overpayment while allowing exact balance", () => {
  assert.match(guard, /for update/);
  assert.match(guard, /new\.amount > available/);
  assert.doesNotMatch(guard, /new\.amount >= available/);
  assert.match(guard, /event_staff_settlement_movements/);
  assert.match(guard, /movement_type='REVERSAL'/);
});

test("expense approval and rejection use one locked canonical RPC", () => {
  assert.match(reviewAction, /review_staff_expense_submission/);
  assert.match(reviewProjection, /where id=p_submission_id\s+for update/);
  assert.match(reviewProjection, /on conflict\(idempotency_key\)/);
  assert.match(reviewProjection, /ensure_staff_monthly_account/);
  assert.match(reviewProjection, /sync_event_operation_cost/);
});

test("rejection requires a reason, preserves evidence and has no financial materialization", () => {
  assert.match(review, /Motivo del rechazo \*/);
  assert.match(reviewProjection, /El motivo de rechazo es obligatorio/);
  const rejectionBranch = reviewProjection.slice(reviewProjection.indexOf("if p_action='REJECT'"), reviewProjection.indexOf("select array_agg"));
  assert.match(rejectionBranch, /STAFF_EXPENSE_REJECTED/);
  assert.doesNotMatch(rejectionBranch, /insert into public\.expenses/);
  assert.doesNotMatch(rejectionBranch, /delete from/);
});

test("customer finance remains outside both Staff flows", () => {
  for (const source of [guard, reviewProjection, advanceAction, reviewAction]) {
    assert.doesNotMatch(source, /invoice_payments|receivable_movements|accounts_receivable_history/);
  }
});
