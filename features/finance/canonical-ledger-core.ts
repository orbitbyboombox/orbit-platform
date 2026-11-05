export type CanonicalLedgerState = "SOLD" | "COLLECTED" | "RECEIVABLE" | "CANCELLED";
export type CanonicalLedgerIntegrity = "OK" | "REVIEW_REQUIRED";
export type CanonicalLedgerPayment = { id: string; invoiceId: string; amount: number; paidAt: string; cashImpact?: number | null; method?: string | null; reason?: string | null; movementType?: string | null; deletedAt?: string | null };
export type CanonicalLedgerInvoice = { id: string; invoiceNumber: string; projectId: string | null; orbitEventId: string | null; projectName: string; customerName: string; issueDate?: string | null; amount: number; recordedPaidAmount: number; status: string; effectiveStatus?: string | null; dueDate?: string | null };
export type CanonicalLedgerRow = { invoiceId: string; invoiceNumber: string; projectId: string | null; orbitEventId: string | null; projectName: string; customerName: string; issueDate?: string | null; sold: number; collected: number; receivable: number; state: CanonicalLedgerState; integrity: CanonicalLedgerIntegrity; duplicatePaymentIds: string[]; unclassifiedPaymentIds: string[] };
const number = (value: unknown) => Number(value ?? 0) || 0;
const activePayment = (payment: CanonicalLedgerPayment) => !payment.deletedAt && payment.amount > 0;
const paymentKey = (payment: CanonicalLedgerPayment) => [payment.invoiceId, payment.amount, payment.paidAt, payment.method ?? "", payment.reason ?? "", payment.movementType ?? ""].join("|");
const paidAmount = (recorded: number, payments: readonly CanonicalLedgerPayment[]) => payments.length ? payments.reduce((total, payment) => total + number(payment.cashImpact ?? payment.amount), 0) : Math.max(0, number(recorded));
export function buildCanonicalFinanceLedger(invoices: readonly CanonicalLedgerInvoice[], payments: readonly CanonicalLedgerPayment[]): CanonicalLedgerRow[] {
  const paymentsByInvoice = new Map<string, CanonicalLedgerPayment[]>();
  for (const payment of payments) paymentsByInvoice.set(payment.invoiceId, [...(paymentsByInvoice.get(payment.invoiceId) ?? []), payment]);
  return invoices.map((invoice) => {
    const active = (paymentsByInvoice.get(invoice.id) ?? []).filter(activePayment);
    const seen = new Map<string, string[]>();
    for (const payment of active) seen.set(paymentKey(payment), [...(seen.get(paymentKey(payment)) ?? []), payment.id]);
    const duplicatePaymentIds = [...seen.values()].filter((ids) => ids.length > 1).flat();
    const uniqueActive = [...seen.keys()].map((key) => active.find((payment) => paymentKey(payment) === key)).filter((payment): payment is CanonicalLedgerPayment => Boolean(payment));
    const unclassifiedPaymentIds = active.filter((payment) => !payment.method || !payment.paidAt).map((payment) => payment.id);
    const collected = Math.max(0, Math.min(invoice.amount, paidAmount(invoice.recordedPaidAmount, uniqueActive)));
    const receivable = Math.max(0, invoice.amount - collected);
    const cancelled = (invoice.effectiveStatus ?? invoice.status) === "CANCELLED";
    return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, projectId: invoice.projectId, orbitEventId: invoice.orbitEventId, projectName: invoice.projectName, customerName: invoice.customerName, issueDate: invoice.issueDate, sold: number(invoice.amount), collected, receivable, state: cancelled ? "CANCELLED" : receivable === 0 ? "COLLECTED" : collected > 0 ? "RECEIVABLE" : "SOLD", integrity: duplicatePaymentIds.length || unclassifiedPaymentIds.length ? "REVIEW_REQUIRED" : "OK", duplicatePaymentIds, unclassifiedPaymentIds };
  });
}
export function canonicalLedgerSummary(rows: readonly CanonicalLedgerRow[]) { return rows.reduce((summary, row) => ({ sold: summary.sold + row.sold, collected: summary.collected + row.collected, receivable: summary.receivable + row.receivable, cancelled: summary.cancelled + (row.state === "CANCELLED" ? 1 : 0), reviewRequired: summary.reviewRequired + (row.integrity === "REVIEW_REQUIRED" ? 1 : 0) }), { sold: 0, collected: 0, receivable: 0, cancelled: 0, reviewRequired: 0 }); }
