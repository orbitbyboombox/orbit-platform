import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reconcileExpenseSources,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseProjection,
} from "./expense-source-reconciliation";

const categoryNames: Record<string, ExpenseCategory> = {
  PERSONAL: "PERSONNEL_OPERATIONS",
  STAFF: "PERSONNEL_OPERATIONS",
  OTHER_OPERATIONAL: "PERSONNEL_OPERATIONS",
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
  sourceCounts: { expenses: number; staffSubmissions: number; reimbursements: number; staffSettlements: number };
  requiresReview: number;
};

/**
 * Read-only audit snapshot, not an accounting close or bank cash report.
 * A failed query must fail closed; missing tables must never produce a false zero.
 */
export async function loadExpenseSourceSnapshot(client: SupabaseClient): Promise<ExpenseSourceSnapshot> {
  const [expenses, submissions, reimbursements, settlements] = await Promise.all([
    client.from("expenses").select("id,total,status,category,confirmed_category,project_id,event_staff_settlement_id").is("deleted_at", null),
    client.from("staff_expense_submissions").select("id,amount,status,project_id,materialized_expense_id"),
    client.from("staff_reimbursement_payments").select("id,amount,expense_id,staff_expense_submission_id,settlement_id,project_id"),
    client.from("event_staff_payments").select("id,total_internal_payment,status,project_id"),
  ]);
  const error = expenses.error ?? submissions.error ?? reimbursements.error ?? settlements.error;
  if (error) throw error;
  const inputs: ExpenseInput[] = [
    ...(expenses.data ?? []).map((row) => ({
      source: "expenses" as const,
      id: row.id,
      amount: Number(row.total),
      status: row.status,
      category: normalizeExpenseCategory(row.confirmed_category ?? row.category),
      projectId: row.project_id,
      settlementId: row.event_staff_settlement_id,
    })),
    ...(submissions.data ?? []).map((row) => ({
      source: "staff_expense_submissions" as const,
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      projectId: row.project_id,
      materializedExpenseId: row.materialized_expense_id,
    })),
    ...(reimbursements.data ?? []).map((row) => ({
      source: "staff_reimbursement_payments" as const,
      id: row.id,
      amount: Number(row.amount),
      expenseId: row.expense_id,
      submissionId: row.staff_expense_submission_id,
      settlementId: row.settlement_id,
      projectId: row.project_id,
    })),
    ...(settlements.data ?? []).map((row) => ({
      source: "event_staff_payments" as const,
      id: row.id,
      amount: Number(row.total_internal_payment),
      status: row.status,
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
    },
    requiresReview: projections.filter((row) => row.integrity === "REVIEW_REQUIRED").length,
  };
}
