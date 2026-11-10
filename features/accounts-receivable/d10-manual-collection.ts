export type D10ManualCollectionCandidate = {
  eventDate: string | null;
  outstandingBalance: number;
  status: string | null | undefined;
  projectStatus?: string | null;
  scheduledFor?: string | null;
};

export function chileToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function defaultD10Date(eventDate: string | null): string | null {
  if (!eventDate) return null;
  const value = new Date(`${eventDate.slice(0, 10)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 10);
  return value.toISOString().slice(0, 10);
}

export function isD10ManualCollectionDue(
  candidate: D10ManualCollectionCandidate,
  today: string,
): boolean {
  const status = `${candidate.status ?? candidate.projectStatus ?? ""}`.toUpperCase();
  if (!candidate.eventDate || candidate.outstandingBalance <= 0) return false;
  if (["CANCELLED", "ARCHIVED", "DELETED", "VOID", "REJECTED"].includes(status)) return false;
  return (candidate.scheduledFor ?? defaultD10Date(candidate.eventDate)) === today;
}
