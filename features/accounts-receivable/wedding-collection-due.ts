export type WeddingCollectionCandidate = {
  projectType: string;
  eventDate: string | null;
  outstandingBalance: number;
  status: string;
};

function civilDay(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return timestamp / 86400000;
}

export function isWeddingCollectionDue(invoice: WeddingCollectionCandidate, today: string): boolean {
  const type = invoice.projectType.trim().toUpperCase();
  if (type !== "WEDDING" && type !== "MATRIMONIO") return false;
  if (!Number.isFinite(invoice.outstandingBalance) || invoice.outstandingBalance <= 0) return false;
  if (["PAID", "CANCELLED", "ARCHIVED", "DELETED"].includes(invoice.status.toUpperCase())) return false;
  const eventDay = civilDay(invoice.eventDate);
  const todayDay = civilDay(today);
  return eventDay !== null && todayDay !== null && eventDay - todayDay >= 0 && eventDay - todayDay <= 10;
}
