import assert from "node:assert/strict";
import test from "node:test";
import { EXPENSE_CATEGORIES, expenseCategoryTotals, reconcileExpenseSources } from "../features/finance/expense-source-reconciliation.ts";

test("six master categories remain stable", () => {
  assert.equal(EXPENSE_CATEGORIES.length, 6);
  assert.equal(new Set(EXPENSE_CATEGORIES.map((item) => item.code)).size, 6);
});

test("stock receipt and consumption never create cash or duplicate purchase costs", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "paper-purchase", amount: 100000, category: "SUPPLIES_PRODUCTION", status: "APPROVED" },
    { source: "paper_warehouse_receipts", id: "receipt-1", amount: 100000 },
    { source: "inventory_movements", id: "consume-1", amount: 30000 },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.recognizedCost, 0), 100000);
  assert.equal(rows.reduce((sum, row) => sum + row.confirmedCashOutflow, 0), 0);
});

test("materialized staff request and reimbursement are not new recognized costs", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "staff-expense", amount: 15000, category: "PERSONNEL_OPERATIONS", status: "APPROVED" },
    { source: "staff_expense_submissions", id: "request-1", amount: 15000, materializedExpenseId: "staff-expense" },
    { source: "staff_reimbursement_payments", id: "refund-1", amount: 15000, expenseId: "staff-expense", submissionId: "request-1" },
  ]);
  assert.deepEqual(rows.map((row) => row.recognizedCost), [15000, 0, 0]);
});

test("settlement items are detail, not extra expense", () => {
  const rows = reconcileExpenseSources([
    { source: "event_staff_payments", id: "settlement-1", amount: 40000, status: "FINALIZED", category: "PERSONNEL_OPERATIONS" },
    { source: "event_staff_payment_items", id: "item-1", amount: 20000, settlementId: "settlement-1" },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.recognizedCost, 0), 40000);
});

test("unlinked reimbursements and duplicate IDs require review", () => {
  const rows = reconcileExpenseSources([
    { source: "staff_reimbursement_payments", id: "refund-1", amount: 1000 },
    { source: "staff_reimbursement_payments", id: "refund-1", amount: 1000 },
  ]);
  assert.equal(rows[0].integrity, "REVIEW_REQUIRED");
  assert.equal(rows[1].integrity, "REVIEW_REQUIRED");
  assert.ok(rows[1].reviewReasons.includes("DUPLICATE_OR_MISSING_SOURCE_ID"));
});

test("category totals exclude unclassified and review-required rows", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "fuel", amount: 20000, category: "TRANSPORT_VEHICLES", status: "APPROVED" },
    { source: "expenses", id: "unknown", amount: 10000, status: "APPROVED" },
  ]);
  const transport = expenseCategoryTotals(rows).find((row) => row.category === "TRANSPORT_VEHICLES");
  assert.equal(transport?.recognizedCost, 20000);
  assert.equal(transport?.confirmedCashOutflow, 0);
});

test("linked settlement and expense are held for review instead of both entering category totals", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "expense-1", amount: 40000, status: "APPROVED", category: "PERSONNEL_OPERATIONS", settlementId: "settlement-1" },
    { source: "event_staff_payments", id: "settlement-1", amount: 40000, status: "FINALIZED", category: "PERSONNEL_OPERATIONS" },
  ]);
  assert.ok(rows.every((row) => row.integrity === "REVIEW_REQUIRED"));
  assert.equal(expenseCategoryTotals(rows).find((row) => row.category === "PERSONNEL_OPERATIONS")?.recognizedCost, 0);
});

test("unknown expense state requires review and is excluded from totals", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "e-unknown", amount: 2000, status: "UNRECOGNIZED", category: "OFFICE_ADMIN" },
  ]);
  assert.equal(rows[0].integrity, "REVIEW_REQUIRED");
  assert.equal(expenseCategoryTotals(rows).find((row) => row.category === "OFFICE_ADMIN")?.recognizedCost, 0);
});

test("every occurrence of a duplicated expense ID is excluded, regardless of input order", () => {
  const rows = reconcileExpenseSources([
    { source: "expenses", id: "same-id", amount: 25000, status: "PAID", category: "OFFICE_ADMIN" },
    { source: "expenses", id: "same-id", amount: 25000, status: "PAID", category: "OFFICE_ADMIN" },
  ]);
  assert.ok(rows.every((row) => row.integrity === "REVIEW_REQUIRED"));
  assert.equal(expenseCategoryTotals(rows).find((row) => row.category === "OFFICE_ADMIN")?.recognizedCost, 0);
});
