export const OVERDUE_INVOICE_GROUP_ID = "founder-action:overdue-invoices-group";
export const OVERDUE_INVOICE_GROUP_HREF = "/finance/collections?filter=OVERDUE";

export type OverdueReceivableSummary = {
  count: number;
  total: number;
  oldestDueDate: string | null;
};

export type OverdueReceivableRow = {
  due_date: string | null;
  outstanding_balance: number | string | null;
  effective_status?: string | null;
};

const closedStatuses = new Set([
  "ARCHIVED",
  "CANCELLED",
  "CANCELED",
  "DELETED",
  "PAID",
  "VOID",
]);

export function chileDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).format(now);
}

export function summarizeOverdueReceivables(
  rows: readonly OverdueReceivableRow[],
  today: string,
): OverdueReceivableSummary {
  const overdue = rows.filter((row) => {
    const balance = Number(row.outstanding_balance ?? 0);
    const status = String(row.effective_status ?? "").toUpperCase();
    return Boolean(row.due_date) && row.due_date! < today && balance > 0 && !closedStatuses.has(status);
  });

  return {
    count: overdue.length,
    total: overdue.reduce((sum, row) => sum + Number(row.outstanding_balance ?? 0), 0),
    oldestDueDate: overdue.reduce<string | null>(
      (oldest, row) => (!oldest || (row.due_date && row.due_date < oldest) ? row.due_date : oldest),
      null,
    ),
  };
}

export function overdueGroupDetail(summary: Pick<OverdueReceivableSummary, "count" | "total">) {
  const invoices = `${summary.count} ${summary.count === 1 ? "pendiente" : "pendientes"}`;
  const total = new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(summary.total);
  return `${invoices} · ${total} por cobrar`;
}
