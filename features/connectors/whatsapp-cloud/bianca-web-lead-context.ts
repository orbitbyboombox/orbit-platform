import type { BiancaWebLeadContext } from "@/features/nova-channel";

const PARTIAL_DATE_PATTERN = /\b([0-3]?\d)[./-]([01]?\d)\b/;

export interface BiancaLeadDateParts {
  day: number;
  month: number;
}

export interface ParsedBiancaWebLead {
  context: BiancaWebLeadContext;
  source: "WEB_FORM_WHATSAPP";
  structured: true;
}

const STRUCTURED_LEAD_HEADER = /^\s*NUEVA\s+COTIZACI(?:[ÓO])N\s+BOOMBOX\s*$/i;
const LABELS: Array<[keyof BiancaWebLeadContext, RegExp]> = [
  ["name", /^nombre\s*:/i],
  ["phone", /^(?:tel[eé]fono|telefono|celular|whatsapp)\s*:/i],
  ["email", /^(?:correo|email)\s*:/i],
  ["eventType", /^(?:tipo\s+de\s+evento|tipo\s+evento)\s*:/i],
  ["eventDate", /^fecha\s*:/i],
  ["commune", /^(?:comuna\s*\/\s*lugar|comuna|lugar)\s*:/i],
  ["message", /^mensaje\s*:/i],
];

function labelFor(line: string) {
  return LABELS.find(([, pattern]) => pattern.test(line));
}

function locationFromMessage(message: string) {
  const match = message.match(/\b(?:en|em)\s+([^,.\n]+(?:\s+roja)?)/i);
  return match?.[1]?.trim().replace(/\s+/g, " ");
}

/** Recognizes the real BOOMBOX web-form payload pasted into WhatsApp. */
export function parseBiancaStructuredWebLead(text: string, senderWaId?: string): ParsedBiancaWebLead | undefined {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const header = normalized.split("\n").find((line) => STRUCTURED_LEAD_HEADER.test(line));
  if (!header) return undefined;

  const values: Record<string, string> = {};
  let current: keyof BiancaWebLeadContext | undefined;
  for (const line of normalized.split("\n").slice(normalized.split("\n").indexOf(header) + 1)) {
    const found = labelFor(line.trim());
    if (found) {
      current = found[0];
      const value = line.replace(LABELS.find(([, pattern]) => pattern === found[1])?.[1] ?? /^$/, "").trim();
      values[current] = value;
    } else if (current === "message" && line.trim()) {
      values.message = `${values.message ?? ""} ${line.trim()}`.trim();
    }
  }

  const message = values.message?.trim() || undefined;
  const dateParts = !values.eventDate && message ? extractBiancaLeadDateParts(message) : undefined;
  const venueFromMessage = !values.venue && message ? locationFromMessage(message) : undefined;
  const commune = values.commune?.trim() || undefined;
  const venue = values.venue?.trim() || venueFromMessage;
  const context: BiancaWebLeadContext = {
    name: values.name?.trim() || undefined,
    phone: values.phone?.trim() || undefined,
    email: values.email?.trim() || undefined,
    eventType: values.eventType?.trim() || undefined,
    eventDate: values.eventDate?.trim() || undefined,
    eventDateParts: dateParts,
    eventDateYearPending: Boolean(dateParts && !values.eventDate),
    commune,
    venue,
    locationContext: [venue, commune].filter(Boolean).join(", ") || undefined,
    message,
    declaredPhoneMismatch: Boolean(senderWaId && values.phone && senderWaId.replace(/\D/g, "") !== values.phone.replace(/\D/g, "")),
  };
  return { context: normalizeBiancaWebLeadContext(context) ?? {}, source: "WEB_FORM_WHATSAPP", structured: true };
}

/** Extracts only a day/month from a lead's free text; a year is never guessed. */
export function extractBiancaLeadDateParts(text: string): BiancaLeadDateParts | undefined {
  const match = text.match(PARTIAL_DATE_PATTERN);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  return { day, month };
}

export function normalizeBiancaWebLeadContext(context?: BiancaWebLeadContext) {
  if (!context) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
  ) as BiancaWebLeadContext;
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

export function buildBiancaWebLeadPrompt(context?: BiancaWebLeadContext) {
  const lead = normalizeBiancaWebLeadContext(context);
  if (!lead) return "";
  const dateParts = !lead.eventDate && lead.message ? extractBiancaLeadDateParts(lead.message) : undefined;
  const effectiveDateParts = lead.eventDateParts ?? dateParts;
  const dateInstruction = effectiveDateParts
    ? `El mensaje libre menciona el día ${effectiveDateParts.day} y mes ${effectiveDateParts.month}, pero no el año. No inventes el año: pide únicamente confirmarlo cuando sea necesario para disponibilidad o cotización.`
    : "";
  const fields = [
    ["Nombre confirmado por formulario", lead.name],
    ["Correo", lead.email],
    ["Tipo de evento", lead.eventType],
    ["Fecha estructurada", lead.eventDate],
    ["Comuna", lead.commune],
    ["Recinto especial estructurado", lead.specialVenue],
    ["Lugar", lead.venue],
    ["Contexto de ubicación", lead.locationContext],
    ["Mensaje libre", lead.message],
  ].filter(([, value]) => value);
  return [
    "FUENTE DEL TURNO: WEB_FORM_LEAD (lead de alta intención).",
    "Reutiliza los campos del formulario como datos ya entregados; no vuelvas a preguntar nombre, tipo de evento, correo, comuna o fecha si están presentes.",
    "El nombre explícito del formulario cuenta como preferred_name CONFIRMED para esta oportunidad; no uses profile_name ni apodos históricos.",
    "Mantén la conversación comercial por WhatsApp después de orientar o enviar un catálogo.",
    "Catálogo de matrimonios/novios: /catalogo/novios; empresas: /catalogo/empresas; eventos generales: /catalogo/eventos. Usa el enlace canónico entregado por ORBIT, no construyas otra URL.",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    dateInstruction,
  ].filter(Boolean).join("\n");
}
