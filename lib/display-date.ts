/** Display only: date-only values keep their calendar day; instants use Chile time. */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("day")}/${part("month")}/${part("year")}`;
}

export function formatDisplayMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
}
