/**
 * Stage 2 finance: conservative, read-only expense reconciliation.
 * Does not infer a bank payment from an approved expense or stock movement.
 */
export type ExpenseCategory =
  | "PERSONNEL_OPERATIONS"
  | "SUPPLIES_PRODUCTION"
  | "TRANSPORT_VEHICLES"
  | "OFFICE_ADMIN"
  | "EQUIPMENT_MAINTENANCE"
  | "COMMERCIAL_MARKETING";

export const EXPENSE_CATEGORIES: ReadonlyArray<{ code: ExpenseCategory; label: string }> = [
  { code: "PERSONNEL_OPERATIONS", label: "Personal y operación" },
  { code: "SUPPLIES_PRODUCTION", label: "Insumos y producción" },
  { code: "TRANSPORT_VEHICLES", label: "Transporte y vehículos" },
  { code: "OFFICE_ADMIN", label: "Oficina y administración" },
  { code: "EQUIPMENT_MAINTENANCE", label: "Equipos y mantenimiento" },
  { code: "COMMERCIAL_MARKETING", label: "Comercial y marketing" },
];

export type ExpenseSource =
  | "expenses"
  | "staff_expense_submissions"
  | "staff_reimbursement_payments"
  | "event_staff_payments"
  | "event_staff_payment_items"
  | "inventory_movements"
  | "paper_warehouse_receipts"
  | "finance_recurring_expense_rules";

export type ExpenseInput = {
  source: ExpenseSource;
  id: string;
  amount: number;
  projectId?: string | null;
  expenseId?: string | null;
  materializedExpenseId?: string | null;
  settlementId?: string | null;
  submissionId?: string | null;
  category?: ExpenseCategory | null;
  status?: string | null;
};

export type ExpenseProjection = {
  key: string;
  source: ExpenseSource;
  id: string;
  category: ExpenseCategory | null;
  recognizedCost: number;
  confirmedCashOutflow: number;
  reviewReasons: string[];
  integrity: "OK" | "REVIEW_REQUIRED";
};

const validAmount = (value: number) => Number.isFinite(value) && value >= 0;

export function reconcileExpenseSources(inputs: readonly ExpenseInput[]): ExpenseProjection[] {
  const known = new Set(inputs.map((item) => `${item.source}:${item.id}`));
  const seen = new Set<string>();

  return inputs.map((item) => {
    const key = `${item.source}:${item.id}`;
    const reasons: string[] = [];
    if (!item.id || seen.has(key)) reasons.push("DUPLICATE_OR_MISSING_SOURCE_ID");
    seen.add(key);
    if (!validAmount(item.amount)) reasons.push("INVALID_AMOUNT");
    if (!item.category && item.source === "expenses") reasons.push("UNCLASSIFIED_EXPENSE");

    // Existing FK references establish economic linkage; amounts must not be
    // added across parent/child rows as though they were unrelated expenses.
    const linkedExpense = item.expenseId || item.materializedExpenseId;
    if (linkedExpense && !known.has(`expenses:${linkedExpense}`)) reasons.push("EXPENSE_LINK_NOT_IN_INPUT");
    if (item.source === "staff_reimbursement_payments" && !linkedExpense && !item.submissionId && !item.settlementId)
      reasons.push("UNLINKED_REIMBURSEMENT");
    if (item.source === "event_staff_payment_items" && !item.settlementId)
      reasons.push("UNLINKED_SETTLEMENT_ITEM");

    const status = item.status?.toUpperCase() ?? "";
    const eligibleExpense = item.source === "expenses" && ["APPROVED", "PAID", "FINALIZED"].includes(status);
    const eligibleSettlement = item.source === "event_staff_payments" && ["FINALIZED", "PAID"].includes(status);
    const recognizedCost = validAmount(item.amount) && (eligibleExpense || eligibleSettlement) ? item.amount : 0;

    // No source in this generic read model guarantees a unique, settled cash
    // transaction. Actual cash is reconciled separately against payment ledgers.
    // Thus never manufacture cash outflow from statuses or inventory records.
    const confirmedCashOutflow = 0;

    if (item.source === "expenses" && !status) reasons.push("UNKNOWN_EXPENSE_STATUS");
    if (item.source === "event_staff_payments" && !status) reasons.push("UNKNOWN_SETTLEMENT_STATUS");

    return {
      key, source: item.source, id: item.id,
      category: item.category ?? null,
      recognizedCost,
      confirmedCashOutflow,
      reviewReasons: reasons,
      integrity: reasons.length ? "REVIEW_REQUIRED" : "OK",
    };
  });
}

export function expenseCategoryTotals(rows: readonly ExpenseProjection[]) {
  return EXPENSE_CATEGORIES.map(({ code, label }) => ({
    category: code,
    label,
    recognizedCost: rows.reduce((sum, row) => sum + (row.category === code && row.integrity === "OK" ? row.recognizedCost : 0), 0),
    confirmedCashOutflow: rows.reduce((sum, row) => sum + (row.category === code && row.integrity === "OK" ? row.confirmedCashOutflow : 0), 0),
  }));
}
