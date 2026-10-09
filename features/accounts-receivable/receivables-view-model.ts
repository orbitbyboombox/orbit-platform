import { classifyReceivableBucket, isReceivablePastDue } from "./payment-term-classification.ts";
import type { ReceivableInvoice } from "./types.ts";

export type ReceivableViewFilter = "ALL" | "MARRIAGES" | "BUSINESS_EVENTS" | "PARTICULAR_EVENTS" | "REVIEW";

export function uniqueReceivables(rows: readonly ReceivableInvoice[]): ReceivableInvoice[] {
  const byId = new Map<string, ReceivableInvoice>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function filterReceivables(
  rows: readonly ReceivableInvoice[],
  filter: ReceivableViewFilter,
): ReceivableInvoice[] {
  return uniqueReceivables(rows).filter((row) => {
    if (filter === "ALL") return true;
    return classifyReceivableBucket(row.projectType) === filter;
  });
}

export function pendingReceivableTotal(rows: readonly ReceivableInvoice[]): number {
  return uniqueReceivables(rows).reduce(
    (total, row) => total + Math.max(0, row.outstandingBalance),
    0,
  );
}

function dueDateValue(row: ReceivableInvoice): number {
  return row.dueDate ? new Date(`${row.dueDate}T00:00:00Z`).getTime() : Number.POSITIVE_INFINITY;
}

function eventDateValue(row: ReceivableInvoice): number {
  return row.eventDate ? new Date(`${row.eventDate.slice(0, 10)}T00:00:00Z`).getTime() : Number.POSITIVE_INFINITY;
}

export function isFutureReceivable(row: ReceivableInvoice, today: string): boolean {
  if (!row.eventDate) return false;
  return eventDateValue(row) > new Date(`${today.slice(0, 10)}T00:00:00Z`).getTime();
}

export function sortFinishedReceivables(rows: readonly ReceivableInvoice[]): ReceivableInvoice[] {
  return uniqueReceivables(rows).sort((a, b) => {
    const overdue = Number(isReceivablePastDue({ status: b.status, daysRemaining: b.daysRemaining })) - Number(isReceivablePastDue({ status: a.status, daysRemaining: a.daysRemaining }));
    if (overdue !== 0) return overdue;
    const due = dueDateValue(a) - dueDateValue(b);
    if (due !== 0) return due;
    return eventDateValue(a) - eventDateValue(b) || a.id.localeCompare(b.id);
  });
}

export function sortFutureReceivables(rows: readonly ReceivableInvoice[]): ReceivableInvoice[] {
  return uniqueReceivables(rows).sort((a, b) => {
    const event = eventDateValue(a) - eventDateValue(b);
    if (event !== 0) return event;
    return dueDateValue(a) - dueDateValue(b) || a.id.localeCompare(b.id);
  });
}

export function sortPaidHistory(rows: readonly ReceivableInvoice[]): ReceivableInvoice[] {
  return uniqueReceivables(rows).sort((a, b) => {
    const aDate = a.lastPayment?.paidAt ?? a.eventDate ?? a.issueDate ?? "";
    const bDate = b.lastPayment?.paidAt ?? b.eventDate ?? b.issueDate ?? "";
    return bDate.localeCompare(aDate) || b.id.localeCompare(a.id);
  });
}

