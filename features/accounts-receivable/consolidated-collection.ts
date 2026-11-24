import type { ReceivableInvoice } from "./types";

export type ConsolidatedCollectionLine = {
  invoice: ReceivableInvoice;
  overdueDays: number;
  overdue: boolean;
};

export type ConsolidatedCollection = {
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerSecondaryEmail: string | null;
  customerRut: string | null;
  lines: readonly ConsolidatedCollectionLine[];
  overdueTotal: number;
  upcomingTotal: number;
  totalOutstanding: number;
  oldestDueDate: string | null;
  oldestOverdueDays: number;
  oldestTermDays: number | null;
  hasMixedTerms: boolean;
  reviewRequired: boolean;
};

const civilDay = (value: string | null, timeZone = "America/Santiago") => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone });
  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(candidate.getTime()) ? null : formatter.format(candidate);
};

export function daysLate(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  const due = Date.parse(`${civilDay(dueDate) ?? dueDate.slice(0, 10)}T12:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(due) && Number.isFinite(now)
    ? Math.max(0, Math.floor((now - due) / 86_400_000))
    : 0;
}

export function getCustomerRut(invoice: ReceivableInvoice): string | null {
  const value = (invoice as ReceivableInvoice & { customerRut?: string | null }).customerRut;
  return value?.trim() || null;
}

export function hasVerifiedRecipient(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
}

export function groupReceivablesByCustomer(
  invoices: readonly ReceivableInvoice[],
  today: string,
): ConsolidatedCollection[] {
  const groups = new Map<string, ReceivableInvoice[]>();
  for (const invoice of invoices) {
    if (invoice.outstandingBalance <= 0) continue;
    if (["PAID", "CANCELLED"].includes(invoice.status)) continue;
    const current = groups.get(invoice.customerId) ?? [];
    current.push(invoice);
    groups.set(invoice.customerId, current);
  }
  return [...groups.entries()].map(([customerId, rows]) => {
    const sorted = [...rows].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const lines = sorted.map((invoice) => ({
      invoice,
      overdueDays: daysLate(invoice.dueDate, today),
      overdue: daysLate(invoice.dueDate, today) > 0,
    }));
    const terms = new Set(rows.map((row) => `${row.canonicalPaymentTerm}:${row.canonicalPaymentTermDays}`));
    const oldest = lines.find((line) => line.overdue);
    const customerRuts = new Set(rows.map(getCustomerRut).filter(Boolean));
    return {
      customerId,
      customerName: rows[0].customerName,
      customerCompany: rows[0].customerCompany,
      customerEmail: rows[0].customerEmail,
      customerSecondaryEmail: rows[0].customerSecondaryEmail,
      customerRut: getCustomerRut(rows[0]),
      lines,
      overdueTotal: lines.filter((line) => line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      upcomingTotal: lines.filter((line) => !line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      totalOutstanding: lines.reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      oldestDueDate: oldest?.invoice.dueDate ?? null,
      oldestOverdueDays: oldest?.overdueDays ?? 0,
      oldestTermDays: oldest?.invoice.canonicalPaymentTermDays ?? null,
      hasMixedTerms: terms.size > 1,
      reviewRequired: customerRuts.size > 1 || (customerRuts.size === 0 && !hasVerifiedRecipient(rows[0].customerEmail)),
    } satisfies ConsolidatedCollection;
  }).sort((a, b) => b.overdueTotal - a.overdueTotal || a.customerName.localeCompare(b.customerName));
}

export function consolidatedCollectionFingerprint(collection: ConsolidatedCollection, selectedIds: readonly string[]) {
  return JSON.stringify({
    customerId: collection.customerId,
    ids: [...selectedIds].sort(),
    balances: collection.lines.filter((line) => selectedIds.includes(line.invoice.id)).map((line) => [line.invoice.id, line.invoice.outstandingBalance, line.invoice.dueDate]),
  });
}
