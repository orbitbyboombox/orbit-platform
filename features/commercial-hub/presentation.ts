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

const WEDDING_QUICK_SEND_BODY = `Hola [Nombre],

Gracias por considerar a BOOMBOX para ser parte de su matrimonio.

Desde hace 16 años acompañamos celebraciones creando propuestas fotográficas cuidadas, personalizadas y pensadas para guardar recuerdos especiales.

Hemos preparado nuestras alternativas para que puedan revisarlas con calma y elegir la que mejor se adapte a su matrimonio.

**NUESTRA PROPUESTA**

Cuando encuentren una alternativa que les interese, estaremos felices de ayudarlos a revisar disponibilidad y preparar la propuesta final.

Quedamos atentos para ayudarlos con cualquier duda o coordinación.

**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.

Esperamos ser parte de su matrimonio.

Un abrazo,

Equipo BOOMBOX`;

const BIRTHDAY_QUICK_SEND_BODY = `Hola [Nombre],

Gracias por considerar a BOOMBOX para ser parte de tu cumpleaños.

Desde hace 16 años acompañamos celebraciones creando propuestas fotográficas entretenidas, cuidadas y pensadas para compartir buenos momentos.

Hemos preparado nuestras alternativas para que puedas revisarlas con calma y elegir la que mejor se adapte a tu celebración.

**NUESTRA PROPUESTA**

Cuando encuentres una alternativa que te interese, estaremos felices de ayudarte a revisar disponibilidad y preparar la propuesta final.

Quedamos atentos para ayudarte con cualquier duda o coordinación.

**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.

Esperamos ser parte de tu cumpleaños.

Un abrazo,

Equipo BOOMBOX`;

const CELEBRATION_QUICK_SEND_BODY = `Hola [Nombre],

Gracias por considerar a BOOMBOX para ser parte de tu evento.

Desde hace 16 años acompañamos celebraciones creando propuestas fotográficas cuidadas, personalizadas y pensadas para conectar a las personas.

Hemos preparado nuestras alternativas para que puedas revisarlas con calma y elegir la que mejor se adapte a tu evento.

**NUESTRA PROPUESTA**

Cuando encuentres una alternativa que te interese, estaremos felices de ayudarte a revisar disponibilidad y preparar la propuesta final.

Quedamos atentos para ayudarte con cualquier duda o coordinación.

**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.

Esperamos ser parte de tu celebración.

Un abrazo,

Equipo BOOMBOX`;

const COMPANY_QUICK_SEND_BODY = `Hola [Nombre],

Gracias por considerar a BOOMBOX para su próximo evento.

Desde hace 16 años trabajamos junto a empresas, marcas y agencias creando propuestas fotográficas cuidadas, personalizadas y pensadas para conectar con las personas.

Adjuntamos nuestras alternativas para que puedan revisarlas con calma y elegir la que mejor se adapte a su evento.

**NUESTRA PROPUESTA**

Cuando encuentren una alternativa que les interese, estaremos felices de ayudarlos a revisar disponibilidad y preparar la propuesta final.

Quedamos atentos para ayudarlos con cualquier duda o coordinación.

**Importante:** Las fechas se confirman mediante reserva y están sujetas a disponibilidad.

Esperamos ser parte de su evento.

Un abrazo,

Equipo BOOMBOX`;

export function quickSendInitialBody(category: string, configuredBody: string) {
  const canonical =
    category === "WEDDINGS"
      ? WEDDING_QUICK_SEND_BODY
      : category === "BIRTHDAYS"
        ? BIRTHDAY_QUICK_SEND_BODY
        : category === "GRADUATIONS"
          ? CELEBRATION_QUICK_SEND_BODY
          : category === "COMPANIES_CATALOG"
            ? COMPANY_QUICK_SEND_BODY
            : configuredBody;
  return quickSendEditableBody(canonical);
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
