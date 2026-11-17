import { hashCanonicalCalendarFingerprint } from "./canonical-calendar-fingerprint.ts";
import type { CalendarOperationalEventInput, GoogleCalendarEventPayload } from "../types/google-calendar-live.types.ts";
import type { GoogleCalendarRemoteEvent } from "../provider/google-calendar-live.provider.ts";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-CL");
const withoutOptionalCitationNote = (value: string) => normalize(value).replace(/(\d{2}:\d{2})\.?\s*\(1 hora antes del servicio\)\.?/g, "$1.");

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
  if (withoutOptionalCitationNote(remote.description ?? "") !== withoutOptionalCitationNote(expected.description)) throw new Error("La descripción remota contiene diferencias fuera de la nota opcional de citación; requiere revisión manual.");
  if (!remote.description?.includes(`ORBIT Event ID: ${input.orbitEventId}`)) throw new Error("La descripción remota no contiene el ORBIT Event ID vinculado.");
  return { start, end, remoteHash: fingerprintReviewedCalendarEvent(input, remote) };
}
