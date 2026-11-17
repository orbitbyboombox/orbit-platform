import type { CalendarOperationalEventInput } from "../types/google-calendar-live.types";

const categoryLabels: Record<string, string> = {
  QR: "QR",
  IMANES: "Imanes",
  SCRAPBOOK: "SCRAPBOOK",
  FONDO: "Fondo",
  TRASLADO: "Transporte",
};

function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  const weekday = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
  return `${weekday} ${day}/${month}/${year}`;
}

function extraNames(input: CalendarOperationalEventInput): string[] {
  const names = input.extras
    .map((value) => value.trim())
    .filter((value) => value && !/^(?:NO\b|N\/A\b|FALSE\b)/i.test(value) && !/:\s*NO\s*$/i.test(value));
  const categories = input.operationalExtras?.categories;
  if (categories) {
    for (const [category, enabled] of Object.entries(categories)) {
      if (!enabled) continue;
      const detail = input.operationalExtras?.details[category as keyof typeof input.operationalExtras.details] ?? [];
      const candidates = detail.length ? detail : [categoryLabels[category] ?? category];
      for (const candidate of candidates) {
        if (!names.some((name) => name.localeCompare(candidate, "es", { sensitivity: "base" }) === 0)) names.push(candidate);
      }
    }
  }
  return [...new Set(names)];
}

export function buildGoogleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function buildCalendarDescription(input: CalendarOperationalEventInput, orbitEventId: string): string {
  const startDate = input.serviceStartDate;
  const endDate = input.serviceEndDate ?? input.eventDate;
  const serviceWindow = startDate === endDate
    ? `${formatDate(startDate)} de ${input.serviceStart} a ${input.serviceEnd}`
    : `${formatDate(startDate)} a las ${input.serviceStart} hasta ${formatDate(endDate)} a las ${input.serviceEnd}`;
  const includedExtras = extraNames(input);
  const blocks = input.operationalBlocks ?? [];
  const blockLines = blocks.length ? ["", "PLANIFICACIÓN OPERACIONAL", ...blocks.map((block) => `- ${block.name}: ${block.startAt}–${block.endAt}`)] : [];

  return [
    `CITACIÓN OPERADORES BOOMBOX: ${formatDate(input.calendarStartDate)} a las ${input.calendarStartTime} (1 hora antes del servicio).`,
    `SERVICIO CLIENTE: ${serviceWindow} (${input.contractedHours} horas).`,
    `Servicio: ${input.service}`,
    `Duración contratada: ${input.contractedHours} horas`,
    ...(includedExtras.length ? [`Extras incluidos: ${includedExtras.join(", ")}`] : []),
    `Cliente: ${input.customerName}`,
    `Dirección: ${input.customerAddress}`,
    `Teléfono cliente: ${input.customerPhone}`,
    `Contacto producción: ${input.operationalContact ?? input.operator}`,
    `Google Maps: ${buildGoogleMapsLink(input.customerAddress)}`,
    `ORBIT Event ID: ${orbitEventId}`,
    ...blockLines,
  ].join("\n");
}
