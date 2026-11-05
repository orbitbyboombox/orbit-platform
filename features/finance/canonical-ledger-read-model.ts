import { loadAccountsReceivable } from "@/features/accounts-receivable";
import type { SupabaseClient } from "@supabase/supabase-js";
export * from "./canonical-ledger-core";
import { buildCanonicalFinanceLedger, type CanonicalLedgerRow } from "./canonical-ledger-core";

export async function loadCanonicalFinanceLedger(client: SupabaseClient): Promise<CanonicalLedgerRow[]> {
  const [dataset, paymentsResult] = await Promise.all([
    loadAccountsReceivable(client),
    client.from("invoice_payments").select("id,invoice_id,amount,paid_at,method,reason,movement_type,deleted_at").is("deleted_at", null),
  ]);
  if (paymentsResult.error) throw paymentsResult.error;
  const impacts = await Promise.all((paymentsResult.data ?? []).map((payment) => client.rpc("invoice_payment_cash_impact", { p_movement_type: payment.movement_type, p_amount: payment.amount })));
  const impactError = impacts.find((result) => result.error)?.error;
  if (impactError) throw impactError;
  return buildCanonicalFinanceLedger(
    dataset.invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, projectId: invoice.projectId, orbitEventId: invoice.orbitEventId, projectName: invoice.projectName, customerName: invoice.customerName, issueDate: invoice.issueDate, amount: invoice.amount, recordedPaidAmount: invoice.paidAmount, status: invoice.status, effectiveStatus: invoice.status, dueDate: invoice.dueDate })),
    (paymentsResult.data ?? []).map((payment, index) => ({ id: payment.id, invoiceId: payment.invoice_id, amount: Number(payment.amount ?? 0), paidAt: payment.paid_at, cashImpact: Number(impacts[index]?.data ?? 0), method: payment.method, reason: payment.reason, movementType: payment.movement_type, deletedAt: payment.deleted_at })),
  );
}
