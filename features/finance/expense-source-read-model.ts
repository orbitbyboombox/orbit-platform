import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reconcileExpenseSources,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseProjection,
} from "./expense-source-reconciliation.ts";

const categoryNames: Record<string, ExpenseCategory> = {
  PERSONAL: "PERSONNEL_OPERATIONS",
  STAFF: "PERSONNEL_OPERATIONS",
  PERSONNEL_OPERATIONS: "PERSONNEL_OPERATIONS",
  INSUMOS: "SUPPLIES_PRODUCTION",
  SUPPLIES_PRODUCTION: "SUPPLIES_PRODUCTION",
  TRANSPORTE: "TRANSPORT_VEHICLES",
  TRANSPORT: "TRANSPORT_VEHICLES",
  FUEL: "TRANSPORT_VEHICLES",
  TRANSPORT_VEHICLES: "TRANSPORT_VEHICLES",
  OFICINA: "OFFICE_ADMIN",
  ADMINISTRATION: "OFFICE_ADMIN",
  OFFICE_ADMIN: "OFFICE_ADMIN",
  EQUIPOS: "EQUIPMENT_MAINTENANCE",
  EQUIPMENT_MAINTENANCE: "EQUIPMENT_MAINTENANCE",
  MARKETING: "COMMERCIAL_MARKETING",
  COMMERCIAL_MARKETING: "COMMERCIAL_MARKETING",
};

export function normalizeExpenseCategory(value: string | null | undefined): ExpenseCategory | null {
  return categoryNames[(value ?? "").trim().toUpperCase()] ?? null;
}

export type ExpenseSourceSnapshot = {
  projections: ExpenseProjection[];
  sourceCounts: { expenses: number; staffSubmissions: number; reimbursements: number; staffSettlements: number; recurringRules: number; staffAdvances: number; staffMonthlyCloseItems: number };
  requiresReview: number;
};

/**
 * Read-only audit snapshot, not an accounting close or bank cash report.
 * A failed query must fail closed; missing tables must never produce a false zero.
 */
export async function loadExpenseSourceSnapshot(client: SupabaseClient): Promise<ExpenseSourceSnapshot> {
  const [expenses, submissions, reimbursements, settlements, recurringRules, advances, monthlyCloseItems] = await Promise.all([
    client.from("expenses").select("id,total,status,category,confirmed_category,project_id,event_staff_settlement_id").is("deleted_at", null),
    client.from("staff_expense_submissions").select("id,amount,status,project_id,materialized_expense_id"),
    client.from("staff_reimbursement_payments").select("id,amount,expense_id,staff_expense_submission_id,settlement_id,project_id"),
    client.from("event_staff_payments").select("id,total_internal_payment,status,settlement_status,project_id").is("deleted_at", null),
    client.from("finance_recurring_expense_rules").select("id,amount,category,active,frequency,next_due_date"),
    client.from("staff_payment_advances").select("id,amount,payment_month_id"),
    client.from("staff_monthly_close_items").select("id,settlement_id,monthly_close_id,close_version"),
  ]);
  const error = expenses.error ?? submissions.error ?? reimbursements.error ?? settlements.error ?? recurringRules.error ?? advances.error ?? monthlyCloseItems.error;
  if (error) throw error;
  if (!expenses.data || !submissions.data || !reimbursements.data || !settlements.data || !recurringRules.data || !advances.data || !monthlyCloseItems.data) {
    throw new Error("FINANCE_AUDIT_INCOMPLETE_SOURCE");
  }
  const safeAmount = (value: unknown) => value === null || value === undefined || value === "" ? Number.NaN : Number(value);
  const inputs: ExpenseInput[] = [
    ...(expenses.data ?? []).map((row) => ({
      source: "expenses" as const,
      id: row.id,
      amount: safeAmount(row.total),
      status: row.status,
      category: normalizeExpenseCategory(row.confirmed_category ?? row.category),
      projectId: row.project_id,
      settlementId: row.event_staff_settlement_id,
    })),
    ...(submissions.data ?? []).map((row) => ({
      source: "staff_expense_submissions" as const,
      id: row.id,
      amount: safeAmount(row.amount),
      status: row.status,
      projectId: row.project_id,
      materializedExpenseId: row.materialized_expense_id,
    })),
    ...(reimbursements.data ?? []).map((row) => ({
      source: "staff_reimbursement_payments" as const,
      id: row.id,
      amount: safeAmount(row.amount),
      expenseId: row.expense_id,
      submissionId: row.staff_expense_submission_id,
      settlementId: row.settlement_id,
      projectId: row.project_id,
    })),
    ...(settlements.data ?? []).map((row) => ({
      source: "event_staff_payments" as const,
      id: row.id,
      amount: safeAmount(row.total_internal_payment),
      // Settlement state is financial; status is operational and must not override it.
      // A missing financial state is explicitly reviewed, not inferred as paid.
      status: row.settlement_status ?? null,
      category: "PERSONNEL_OPERATIONS" as const,
      projectId: row.project_id,
    })),
  ];
  const projections = reconcileExpenseSources(inputs);
  return {
    projections,
    sourceCounts: {
      expenses: expenses.data?.length ?? 0,
      staffSubmissions: submissions.data?.length ?? 0,
      reimbursements: reimbursements.data?.length ?? 0,
      staffSettlements: settlements.data?.length ?? 0,
      recurringRules: recurringRules.data.length,
      staffAdvances: advances.data.length,
      staffMonthlyCloseItems: monthlyCloseItems.data.length,
    },
    requiresReview: projections.filter((row) => row.integrity === "REVIEW_REQUIRED").length,
  };
}
