const plainQuoteNumber = (value: string) =>
  value.replace(/^COTIZACI[ÓO]N\s*/i, "").trim();

export function normalizeEmailNewlines(value: string) {
  return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n?/g, "\n");
}

export function quoteStorageKey(quoteId: string, quotationNumber: string) {
  const safeNumber = plainQuoteNumber(quotationNumber)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `commercial/quotes/${quoteId}/cotizacion-${safeNumber}.pdf`;
}

export function quoteDisplayFilename(quotationNumber: string) {
  return `Cotización BOOMBOX ${plainQuoteNumber(quotationNumber)}.pdf`;
}

export function formalQuoteSubject(quotationNumber: string, customer = "") {
  const suffix = customer.trim() ? ` — ${customer.trim()}` : "";
  return `Cotización BOOMBOX ${plainQuoteNumber(quotationNumber)}${suffix}`;
}

export function formatChileanRutInput(value: string) {
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const verifier = clean.slice(-1);
  return `${Number(body).toLocaleString("es-CL")}-${verifier}`;
}

export function normalizeChileanPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("56")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  return digits.slice(0, 8);
}

export function displayChileanPhone(value: string) {
  const digits = normalizeChileanPhone(value);
  return digits ? `+56 9 ${digits.slice(0, 4)} ${digits.slice(4)}`.trim() : "+56 9";
}

export function moneyInputNumber(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(/[^0-9-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function titleCasePerson(value: string) {
  return value.trim().replace(/(^|[\s'-])([\p{L}])/gu, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}
