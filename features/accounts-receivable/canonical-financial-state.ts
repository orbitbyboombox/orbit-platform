export type CanonicalPayment = { amount?: number | null };

export function actualPaidAmount(recordedPaidAmount: number, payments: readonly CanonicalPayment[]): number {
  if (!payments.length) return Math.max(0, Number(recordedPaidAmount) || 0);
  return Math.max(0, payments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0));
}

export function scheduleDueDate(schedule: unknown, fallback: string | null): string | null {
  const rows = Array.isArray(schedule) ? schedule : schedule && typeof schedule === "object" ? [schedule] : [];
  const dueDate = rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>).dueDate : null))
    .find((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value));
  return dueDate?.slice(0, 10) ?? fallback;
}

export function daysUntilDue(dueDate: string | null, today = new Date().toISOString().slice(0, 10)): number | null {
  if (!dueDate) return null;
  return Math.round((Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

export function effectiveReceivableStatus(input: { amount: number; paidAmount: number; dueDate: string | null; recordedStatus: string; today?: string }): "CANCELLED" | "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "DRAFT" | "PENDING" {
  if (input.recordedStatus === "CANCELLED") return "CANCELLED";
  if (input.amount > 0 && input.paidAmount >= input.amount) return "PAID";
  if (input.paidAmount > 0) return "PARTIALLY_PAID";
  if ((daysUntilDue(input.dueDate, input.today) ?? 0) < 0) return "OVERDUE";
  if (input.recordedStatus === "DRAFT") return "DRAFT";
  return "PENDING";
}

