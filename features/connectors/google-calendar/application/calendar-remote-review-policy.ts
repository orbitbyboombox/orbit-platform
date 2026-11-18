import { hashCanonicalCalendarFingerprint } from "./canonical-calendar-fingerprint.ts";
import type { CalendarOperationalEventInput, GoogleCalendarEventPayload } from "../types/google-calendar-live.types.ts";
import type { GoogleCalendarRemoteEvent } from "../provider/google-calendar-live.provider.ts";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-CL");
const normalizeExtra = (value: string) => {
  const normalized = normalize(value).replace(/\bincluido\b/g, "");
  const known = ["qr", "imanes", "scrapbook", "transporte", "fondo"];
  const match = known.find((label) => normalized.includes(label));
  return match ?? normalized.replace(/\s+/g, " ").trim();
};

function extrasLine(description: string) {
  const match = description.split("\n").map((line) => line.trim()).find((line) => /^extras incluidos:/i.test(line));
  if (!match) return [];
  return [...new Set(match.slice(match.indexOf(":") + 1).split(",").map(normalizeExtra).filter(Boolean))].sort();
}

function descriptionField(description: string, label: string) {
  const lines = description.split("\n").map((line) => line.trim());
  const lineIndex = lines.findIndex((line) => line.toLocaleLowerCase("es-CL").startsWith(`${label.toLocaleLowerCase("es-CL")}:`));
  if (lineIndex < 0) return null;
  const line = lines[lineIndex];
  const value = line.slice(line.indexOf(":") + 1).trim();
  return label === "Google Maps" && !value ? (lines[lineIndex + 1] ?? "").trim() : value;
}

function numericDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

function localParts(value: string, timeZone = "America/Santiago") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const item = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${item.year}-${item.month}-${item.day}`, time: `${item.hour}:${item.minute}` };
}

export function fingerprintReviewedCalendarEvent(input: CalendarOperationalEventInput, remote: GoogleCalendarRemoteEvent) {
  if (!remote.start?.dateTime || !remote.end?.dateTime) throw new Error("El evento remoto no tiene un bloque horario verificable.");
  const start = localParts(remote.start.dateTime);
  return hashCanonicalCalendarFingerprint({
    orbitEventId: input.orbitEventId,
    serviceStartAt: `${input.serviceStartDate}T${input.serviceStart}:00`,
    serviceEndAt: `${input.serviceEndDate ?? input.eventDate}T${input.serviceEnd}:00`,
    staffCallAt: `${start.date}T${start.time}:00`, staffCallSource: "CANONICAL",
    location: remote.location ?? input.customerAddress, title: remote.summary, description: remote.description,
  });
}

export function isApprovedRemoteBaselineCurrent(record: {
  approvedRemoteSourceHash?: string; approvedRemotePayloadHash?: string; approvedRemoteEtag?: string;
  currentPayloadHash?: string; lastSyncedPayloadHash?: string;
}, sourceHash: string, remoteHash: string, etag: string | undefined) {
  return Boolean(record.approvedRemoteEtag && record.approvedRemoteSourceHash === sourceHash
    && record.currentPayloadHash === sourceHash && record.approvedRemotePayloadHash === remoteHash
    && record.lastSyncedPayloadHash === remoteHash && record.approvedRemoteEtag === etag);
}

export function verifyApprovedRemoteEvent(input: CalendarOperationalEventInput, expected: GoogleCalendarEventPayload, remote: GoogleCalendarRemoteEvent) {
  if (!remote.etag || !remote.updated) throw new Error("Google Calendar no devolvió ETag y updated; no se puede aceptar el estado remoto.");
  if (remote.status !== "confirmed") throw new Error("El evento de Google Calendar no está confirmado.");
  if (normalize(remote.summary ?? "") !== normalize(expected.title)) throw new Error("El título remoto no coincide con identidad, servicio y tipo de evento canónicos.");
  if (normalize(remote.location ?? "") !== normalize(expected.location)) throw new Error("La dirección remota no coincide con ORBIT.");
  if (!remote.start?.dateTime || !remote.end?.dateTime) throw new Error("El evento remoto no tiene inicio o término con hora.");
  const start = localParts(remote.start.dateTime);
  const end = localParts(remote.end.dateTime);
  const expectedStart = `${input.calendarStartDate}T${input.calendarStartTime}`;
  const expectedEnd = `${input.serviceEndDate ?? input.eventDate}T${input.serviceEnd}`;
  if (`${start.date}T${start.time}` !== expectedStart) throw new Error(`Citación remota ${start.date} ${start.time} no coincide con ORBIT ${expectedStart}.`);
  if (`${end.date}T${end.time}` !== expectedEnd) throw new Error(`Término remoto ${end.date} ${end.time} no coincide con ORBIT ${expectedEnd}.`);
  const remoteCitation = descriptionField(remote.description ?? "", "CITACIÓN OPERADORES BOOMBOX");
  if (remoteCitation === null || !normalize(remoteCitation).includes(normalize(numericDate(input.calendarStartDate))) || !remoteCitation.includes(input.calendarStartTime)) {
    throw new Error(`La citación escrita no coincide: esperada ${numericDate(input.calendarStartDate)} ${input.calendarStartTime}; encontrada ${JSON.stringify(remoteCitation)}; bloque remoto ${start.date} ${start.time}.`);
  }
  const remoteServiceWindow = descriptionField(remote.description ?? "", "SERVICIO CLIENTE");
  const expectedServiceEndDate = input.serviceEndDate ?? input.eventDate;
  if (remoteServiceWindow === null
    || !normalize(remoteServiceWindow).includes(normalize(numericDate(input.serviceStartDate)))
    || !remoteServiceWindow.includes(input.serviceStart)
    || !normalize(remoteServiceWindow).includes(normalize(numericDate(expectedServiceEndDate)))
    || !remoteServiceWindow.includes(input.serviceEnd)
    || !normalize(remoteServiceWindow).includes(normalize(`(${input.contractedHours} horas)`))) throw new Error("El horario o duración del servicio en la descripción no coincide con ORBIT.");
  for (const label of ["Servicio", "Duración contratada", "Cliente", "Dirección", "Teléfono cliente", "Contacto producción", "Google Maps", "ORBIT Event ID"]) {
    const remoteValue = descriptionField(remote.description ?? "", label);
    const expectedValue = descriptionField(expected.description, label);
    const remoteNormalized = label === "Teléfono cliente" ? (remoteValue ?? "").replace(/\D/g, "") : normalize(remoteValue ?? "");
    const expectedNormalized = label === "Teléfono cliente" ? (expectedValue ?? "").replace(/\D/g, "") : normalize(expectedValue ?? "");
    if (remoteValue === null || expectedValue === null || remoteNormalized !== expectedNormalized) throw new Error(`El campo «${label}» de la descripción remota no coincide con ORBIT.`);
  }
  if (JSON.stringify(extrasLine(remote.description ?? "")) !== JSON.stringify(extrasLine(expected.description))) throw new Error("Los extras de la descripción remota no coinciden con los extras canónicos de ORBIT.");
  if (!remote.description?.includes(`ORBIT Event ID: ${input.orbitEventId}`)) throw new Error("La descripción remota no contiene el ORBIT Event ID vinculado.");
  return { start, end, remoteHash: fingerprintReviewedCalendarEvent(input, remote) };
}
