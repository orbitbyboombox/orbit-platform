const chileMonthParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).formatToParts(value);
  return { year: parts.find((part) => part.type === "year")?.value ?? "", month: parts.find((part) => part.type === "month")?.value ?? "" };
};

export function monthKeyForChile(value: string | null | undefined) {
  if (!value) return "";
  const isoDate = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const localDate = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (localDate) return `${localDate[3]}-${localDate[2]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = chileMonthParts(parsed);
  return parts.year && parts.month ? `${parts.year}-${parts.month}` : "";
}

export function currentChileMonth(now = new Date()) {
  const parts = chileMonthParts(now);
  return parts.year && parts.month ? `${parts.year}-${parts.month}` : "";
}

export function monthLabel(value: string) {
  if (!value) return "Todos los meses";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 15));
}
