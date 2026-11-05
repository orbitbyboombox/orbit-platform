import assert from "node:assert/strict";
import test from "node:test";
import { loadExpenseSourceSnapshot } from "../features/finance/expense-source-read-model.ts";

const sourceRows = {
  expenses: [{ id: "expense-1", total: "7000", status: "PAID", category: "FUEL", confirmed_category: null, project_id: null, event_staff_settlement_id: null }],
  staff_expense_submissions: [],
  staff_reimbursement_payments: [],
  event_staff_payments: [],
  finance_recurring_expense_rules: [{ id: "rule-1", amount: "12000", category: "OFFICE_ADMIN", active: true, frequency: "MONTHLY", next_due_date: null }],
  staff_payment_advances: [{ id: "advance-1", amount: "5000", payment_month_id: "month-1" }],
  staff_monthly_close_items: [{ id: "close-1", settlement_id: null, monthly_close_id: "month-1", close_version: 1 }],
};

function mockClient(failedTable?: string) {
  return {
    from(table: keyof typeof sourceRows) {
      const result = { data: sourceRows[table], error: table === failedTable ? new Error("source unavailable") : null };
      return { select() { return { ...result, is() { return result; } }; } };
    },
  };
}

test("additional staff and recurring sources are counted, not added as new costs or cash", async () => {
  const snapshot = await loadExpenseSourceSnapshot(mockClient() as never);
  assert.deepEqual(snapshot.sourceCounts, {
    expenses: 1, staffSubmissions: 0, reimbursements: 0, staffSettlements: 0,
    recurringRules: 1, staffAdvances: 1, staffMonthlyCloseItems: 1,
  });
  assert.equal(snapshot.projections.length, 1);
  assert.equal(snapshot.projections[0].recognizedCost, 7000);
  assert.equal(snapshot.projections[0].confirmedCashOutflow, 0);
});

test("missing recurring source fails closed instead of displaying a misleading total", async () => {
  await assert.rejects(() => loadExpenseSourceSnapshot(mockClient("finance_recurring_expense_rules") as never), /source unavailable/);
});

test("missing monthly staff close source fails closed", async () => {
  await assert.rejects(() => loadExpenseSourceSnapshot(mockClient("staff_monthly_close_items") as never), /source unavailable/);
});


test("financial settlement status takes precedence over operational status", async () => {
  const original = sourceRows.event_staff_payments;
  sourceRows.event_staff_payments = [{ id: "staff-1", total_internal_payment: "19000", status: "ACTIVE", settlement_status: "PAID", project_id: null }] as never;
  try {
    const snapshot = await loadExpenseSourceSnapshot(mockClient() as never);
    const row = snapshot.projections.find((item) => item.id === "staff-1");
    assert.equal(row?.recognizedCost, 19000);
    assert.equal(row?.integrity, "OK");
    assert.equal(row?.confirmedCashOutflow, 0);
  } finally { sourceRows.event_staff_payments = original; }
});

test("pending financial settlement does not become paid because operational status says PAID", async () => {
  const original = sourceRows.event_staff_payments;
  sourceRows.event_staff_payments = [{ id: "staff-2", total_internal_payment: "21000", status: "PAID", settlement_status: "PENDING", project_id: null }] as never;
  try {
    const snapshot = await loadExpenseSourceSnapshot(mockClient() as never);
    const row = snapshot.projections.find((item) => item.id === "staff-2");
    assert.equal(row?.recognizedCost, 0);
    assert.equal(row?.integrity, "OK");
  } finally { sourceRows.event_staff_payments = original; }
});

test("missing financial settlement status remains review required", async () => {
  const original = sourceRows.event_staff_payments;
  sourceRows.event_staff_payments = [{ id: "staff-3", total_internal_payment: "9000", status: "PAID", settlement_status: null, project_id: null }] as never;
  try {
    const snapshot = await loadExpenseSourceSnapshot(mockClient() as never);
    const row = snapshot.projections.find((item) => item.id === "staff-3");
    assert.equal(row?.recognizedCost, 0);
    assert.equal(row?.integrity, "REVIEW_REQUIRED");
  } finally { sourceRows.event_staff_payments = original; }
});
