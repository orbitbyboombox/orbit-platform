export type D10Invoice = {
  id: string;
  project_id?: string | null;
  invoice_number?: string | null;
  status?: string | null;
  currency?: string | null;
  outstanding_balance?: number | string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  due_date?: string | null;
  days_remaining?: number | null;
  deleted_at?: string | null;
  archived_at?: string | null;
  cancelled_at?: string | null;
};

const EXCLUDED = new Set(["CANCELLED", "ARCHIVED", "DELETED", "VOID"]);

/** Read-only summary for a single event. Never invent a missing balance or add currencies. */
export function summarizeD10Invoices(rows: readonly D10Invoice[]) {
  const invoices = rows.filter(row =>
    !row.deleted_at && !row.archived_at && !row.cancelled_at &&
    !EXCLUDED.has(String(row.status ?? "").toUpperCase()));
  const amounts = invoices.map(row => ({
    row,
    balance: Number(row.outstanding_balance),
    total: Number(row.amount),
    paid: Number(row.paid_amount ?? 0),
  }));
  const valid = amounts.every(item =>
    item.row.outstanding_balance !== null &&
    item.row.outstanding_balance !== undefined &&
    Number.isFinite(item.balance) && item.balance >= 0 &&
    Number.isFinite(item.total) && item.total >= 0 &&
    Number.isFinite(item.paid) && item.paid >= 0
  );
  const currencies = new Set(invoices.map(row => String(row.currency ?? "CLP").toUpperCase()));
  const singleCurrency = currencies.size <= 1;
  const outstandingBalance = valid && singleCurrency ? amounts.reduce((sum, x) => sum + x.balance, 0) : 0;
  return {
    invoices,
    valid: valid && singleCurrency,
    outstandingBalance,
    amount: valid && singleCurrency ? amounts.reduce((sum, x) => sum + x.total, 0) : 0,
    paidAmount: valid && singleCurrency ? amounts.reduce((sum, x) => sum + x.paid, 0) : 0,
    representative: invoices.find(row => Number(row.outstanding_balance ?? 0) > 0) ?? invoices[0] ?? null,
  };
}
