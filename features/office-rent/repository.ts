import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOfficeLeaseMetrics,
  type OfficeLeaseDataset,
  type OfficeLeaseDocument,
  type OfficeLeaseMonth,
  type OfficeLeasePayment,
  type OfficeLeaseSettings,
  type OfficeLeaseStatus,
} from "./model";

const chileToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export async function loadOfficeLeaseDataset(client: SupabaseClient): Promise<OfficeLeaseDataset> {
  const today = chileToday();
  const ensure = await client.rpc("ensure_office_lease_obligations", { p_through_month: today });
  if (ensure.error) throw ensure.error;
  const [settingsResult, obligationsResult, financialsResult, paymentsResult, documentsResult] = await Promise.all([
    client.from("office_lease_settings").select("*").eq("settings_key", "PRIMARY").single(),
    client.from("office_lease_obligations").select("id,period,amount_due,due_date,status").order("period", { ascending: false }),
    client.from("office_lease_monthly_financials").select("obligation_id,received_amount,outstanding_amount,effective_status"),
    client.from("office_lease_payments").select("id,obligation_id,amount,paid_on,payment_method,observation,receipt_number,created_at").order("created_at", { ascending: false }),
    client.from("office_lease_documents").select("id,obligation_id,payment_id,document_type,original_filename,mime_type,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const error = settingsResult.error ?? obligationsResult.error ?? financialsResult.error ?? paymentsResult.error ?? documentsResult.error;
  if (error) throw error;
  const row = settingsResult.data;
  const settings: OfficeLeaseSettings = {
    id: row.id,
    tenantLegalName: row.tenant_legal_name,
    tenantRut: row.tenant_rut,
    tenantAddress: row.tenant_address,
    tenantEmail: row.tenant_email ?? "",
    tenantPhone: row.tenant_phone ?? "",
    tenantRepresentative: row.tenant_representative ?? "",
    contractStartDate: row.contract_start_date ?? "",
    contractEndDate: row.contract_end_date ?? "",
    observations: row.observations ?? "",
    unitName: row.unit_name,
    propertyAddress: row.property_address ?? "",
    concept: row.concept,
    monthlyAmount: Number(row.monthly_amount),
    commonExpensesIncluded: Boolean(row.common_expenses_included),
    dueDay: Number(row.due_day),
    mortgageCost: Number(row.mortgage_cost),
    commonExpensesCost: Number(row.common_expenses_cost),
    version: Number(row.version),
  };
  const payments: OfficeLeasePayment[] = (paymentsResult.data ?? []).map((payment) => ({
    id: payment.id,
    obligationId: payment.obligation_id,
    amount: Number(payment.amount),
    paidOn: payment.paid_on,
    paymentMethod: payment.payment_method,
    observation: payment.observation ?? "",
    receiptNumber: Number(payment.receipt_number),
    createdAt: payment.created_at,
  }));
  const financeByMonth = new Map((financialsResult.data ?? []).map((item) => [item.obligation_id, item]));
  const months: OfficeLeaseMonth[] = (obligationsResult.data ?? []).map((obligation) => {
    const finance = financeByMonth.get(obligation.id);
    const receivedAmount = Number(finance?.received_amount ?? 0);
    const outstandingAmount = Number(finance?.outstanding_amount ?? Math.max(0, Number(obligation.amount_due) - receivedAmount));
    const fallbackStatus: OfficeLeaseStatus = receivedAmount >= Number(obligation.amount_due)
      ? "PAID"
      : obligation.due_date < today
        ? "OVERDUE"
        : "PENDING";
    return {
      id: obligation.id,
      period: obligation.period,
      dueDate: obligation.due_date,
      amountDue: Number(obligation.amount_due),
      receivedAmount,
      outstandingAmount,
      status: (finance?.effective_status as OfficeLeaseStatus | undefined) ?? fallbackStatus,
      payments: payments.filter((payment) => payment.obligationId === obligation.id),
    };
  });
  const documents: OfficeLeaseDocument[] = (documentsResult.data ?? []).map((document) => ({
    id: document.id,
    obligationId: document.obligation_id,
    paymentId: document.payment_id,
    documentType: document.document_type,
    originalFilename: document.original_filename,
    mimeType: document.mime_type,
    createdAt: document.created_at,
  }));
  return {
    settings,
    months,
    documents,
    metrics: buildOfficeLeaseMetrics(settings, months, today),
    currentPeriod: `${today.slice(0, 7)}-01`,
  };
}
