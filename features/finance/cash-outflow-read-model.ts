import type { SupabaseClient } from "@supabase/supabase-js";
import { auditCashOutflow, type CashEvidence, type CashEvidenceAudit } from "./cash-outflow-audit.ts";

export async function loadCashOutflowAudit(client: SupabaseClient): Promise<CashEvidenceAudit> {
  const [movements, reimbursements, leasePayments] = await Promise.all([
    client.from("event_staff_settlement_movements").select("id,settlement_id,movement_type,amount,movement_date").is("deleted_at", null),
    client.from("staff_reimbursement_payments").select("id,amount,paid_on,expense_id,staff_expense_submission_id,settlement_id"),
    client.from("office_lease_payments").select("id,amount,paid_on"),
  ]);
  const error = movements.error ?? reimbursements.error ?? leasePayments.error;
  if (error) throw error;
  if (!movements.data || !reimbursements.data || !leasePayments.data) throw new Error("FINANCE_CASH_SOURCE_INCOMPLETE");
  const amount = (value: unknown) => value === null || value === undefined || value === "" ? Number.NaN : Number(value);
  const rows: CashEvidence[] = [
    ...movements.data.map((r) => ({
      source: "event_staff_settlement_movements" as const,
      id: r.id, amount: amount(r.amount), paidOn: r.movement_date,
      settlementId: r.settlement_id,
      // A movement type can be an adjustment rather than a disbursement.
      // Until payment semantics are verified, fail closed.
      ...(r.movement_type === "PAYMENT" ? {} : { amount: Number.NaN }),
    })),
    ...reimbursements.data.map((r) => ({
      source: "staff_reimbursement_payments" as const,
      id: r.id, amount: amount(r.amount), paidOn: r.paid_on,
      expenseId: r.expense_id, submissionId: r.staff_expense_submission_id,
      settlementId: r.settlement_id,
    })),
    ...leasePayments.data.map((r) => ({
      source: "office_lease_payments" as const,
      id: r.id, amount: amount(r.amount), paidOn: r.paid_on,
    })),
  ];
  return auditCashOutflow(rows);
}
