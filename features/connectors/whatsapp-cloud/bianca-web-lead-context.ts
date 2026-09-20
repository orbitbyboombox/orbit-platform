import type { BiancaWebLeadContext } from "@/features/nova-channel";

const PARTIAL_DATE_PATTERN = /\b([0-3]?\d)[./-]([01]?\d)\b/;

export interface BiancaLeadDateParts {
  day: number;
  month: number;
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
  const dateInstruction = dateParts
    ? `El mensaje libre menciona el día ${dateParts.day} y mes ${dateParts.month}, pero no el año. No inventes el año: pide únicamente confirmarlo.`
    : "";
  const fields = [
    ["Nombre confirmado por formulario", lead.name],
    ["Correo", lead.email],
    ["Tipo de evento", lead.eventType],
    ["Fecha estructurada", lead.eventDate],
    ["Comuna", lead.commune],
    ["Recinto especial estructurado", lead.specialVenue],
    ["Lugar", lead.venue],
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
