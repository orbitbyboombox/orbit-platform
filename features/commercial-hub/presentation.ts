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

export function displayChileanPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("569") ? digits.slice(3, 11) : digits.slice(-8);
  return local ? `+56 9 ${local.slice(0, 4)} ${local.slice(4)}`.trim() : "+56 9";
}

export function moneyInputNumber(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(/[^0-9-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function titleCasePerson(value: string) {
  return value.trim().replace(/(^|[\s'-])([\p{L}])/gu, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

export function emailParagraphs(value: string) {
  return normalizeEmailNewlines(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function commercialGreeting(contact: string) {
  const person = titleCasePerson(contact);
  return person ? `Hola ${person},` : "Hola,";
}

export const QUICK_SEND_CTA_LABEL = "VER PLANES Y VALORES";
export const QUICK_SEND_CTA_FALLBACK = "Si el botón no funciona, puedes ver nuestros planes y valores aquí.";

const SOCIAL_QUICK_SEND_BODY = `Hola [Nombre],

Gracias por considerar a BOOMBOX para ser parte de tu evento.

Hace 16 años creamos experiencias fotográficas para matrimonios, cumpleaños y celebraciones en Chile.

Preparamos distintas alternativas para que puedas elegir la experiencia que mejor se adapte a tu celebración.

**¿QUIERES COTIZAR?**

Respóndenos indicando:
• servicio que te interesa
• fecha
• lugar del evento

Revisaremos disponibilidad y prepararemos tu propuesta.

**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.`;

export function quickSendInitialBody(category: string, configuredBody: string) {
  return quickSendEditableBody(
    ["WEDDINGS", "BIRTHDAYS", "GRADUATIONS"].includes(category)
      ? SOCIAL_QUICK_SEND_BODY
      : configuredBody,
  );
}

export function resolveQuickSendBody(value: string, contact: string) {
  const person = titleCasePerson(contact);
  return normalizeEmailNewlines(value)
    .replace(/Hola\s+\[Nombre\],?/gi, commercialGreeting(contact))
    .replaceAll("[Nombre]", person)
    .replace(/Hola\s+,/gi, "Hola,")
    .trim();
}

export function isQuickSendCtaParagraph(value: string) {
  const normalized = value
    .replace(/[👉*\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return normalized === QUICK_SEND_CTA_LABEL;
}

export function quickSendBodyParagraphs(value: string, contact: string) {
  return emailParagraphs(resolveQuickSendBody(value, contact)).filter(
    (paragraph) => !isQuickSendCtaParagraph(paragraph),
  );
}

export function quickSendEditableBody(value: string) {
  return emailParagraphs(value)
    .filter((paragraph) => !isQuickSendCtaParagraph(paragraph))
    .join("\n\n");
}

export function inlineCommercialText(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => ({
    text: part.startsWith("**") && part.endsWith("**") ? part.slice(2, -2) : part,
    strong: part.startsWith("**") && part.endsWith("**"),
  }));
}

export function hasUnresolvedCommercialVariables(value: string) {
  return /\[[A-Za-zÁÉÍÓÚáéíóúÑñ]+\]/.test(value);
}

export function commercialSignatureMode(signatureUrl: string) {
  return signatureUrl.trim() ? "GRAPHICAL" as const : "FALLBACK" as const;
}

export function withoutDuplicateSignature(value: string, fallback: string) {
  const normalized = normalizeEmailNewlines(value).trim();
  const escaped = fallback.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalized.replace(new RegExp(`(?:\\n\\s*){1,2}${escaped}\\s*$`, "i"), "").trim();
}

export function documentCategoryLabel(category: string) {
  if (category === "WEDDINGS") return "Matrimonios / Novios";
  if (category === "COMPANIES") return "Empresas";
  return "Eventos / Cumpleaños / Graduaciones";
}
