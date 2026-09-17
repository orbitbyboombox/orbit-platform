export const ORBIT_EVENT_TIME_ZONE = "America/Santiago";

export class BookingTimeInvalidError extends Error {
  readonly code = "BOOKING_TIME_INVALID";
  constructor(message = "La fecha y hora del evento no son válidas.") {
    super(message);
    this.name = "BookingTimeInvalidError";
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ORBIT_EVENT_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(epochMs: number): Parts {
  const values = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}

function offsetAt(epochMs: number): number {
  const parts = zonedParts(epochMs);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(epochMs / 1000) * 1000;
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  if (!match) throw new BookingTimeInvalidError("La fecha del evento debe usar YYYY-MM-DD.");
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new BookingTimeInvalidError("La fecha del evento no existe.");
  return { year, month, day };
}

function parseClock(value: string): { hour: number; minute: number; second: number } {
  const match = /^([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(value.trim());
  if (!match) throw new BookingTimeInvalidError("La hora del evento debe usar HH:mm.");
  const hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new BookingTimeInvalidError("La hora del evento no es válida.");
  return { hour, minute, second };
}

/** Converts a Chilean wall-clock date/time into an absolute instant using IANA DST rules. */
export function zonedLocalDateTimeToDate(eventDate: string, localTime: string): Date {
  const date = parseDate(eventDate); const clock = parseClock(localTime);
  const wall = Date.UTC(date.year, date.month - 1, date.day, clock.hour, clock.minute, clock.second);
  let candidate = wall;
  for (let attempt = 0; attempt < 4; attempt += 1) candidate = wall - offsetAt(candidate);
  const rendered = zonedParts(candidate);
  if (rendered.year !== date.year || rendered.month !== date.month || rendered.day !== date.day || rendered.hour !== clock.hour || rendered.minute !== clock.minute || rendered.second !== clock.second) throw new BookingTimeInvalidError("La hora cae en un cambio DST no existente en Chile.");
  return new Date(candidate);
}

export function normalizeEventWindow(input: { eventDate: string; serviceStart: string; durationHours?: number; serviceEnd?: string }): { startAt: string; endAt: string } {
  const startAt = input.serviceStart.includes("T") ? new Date(input.serviceStart) : zonedLocalDateTimeToDate(input.eventDate, input.serviceStart);
  if (Number.isNaN(startAt.getTime())) throw new BookingTimeInvalidError("El inicio del servicio no es válido.");
  let endAt: Date;
  if (input.serviceEnd?.includes("T")) {
    endAt = new Date(input.serviceEnd);
  } else if (typeof input.durationHours === "number" && Number.isFinite(input.durationHours) && input.durationHours > 0 && input.durationHours <= 24) {
    endAt = new Date(startAt.getTime() + input.durationHours * 60 * 60 * 1000);
  } else if (input.serviceEnd) {
    endAt = zonedLocalDateTimeToDate(input.eventDate, input.serviceEnd);
    if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  } else {
    throw new BookingTimeInvalidError("La duración del servicio es obligatoria.");
  }
  if (Number.isNaN(endAt.getTime()) || endAt <= startAt || endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1000) throw new BookingTimeInvalidError("La ventana operacional no es válida.");
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}
