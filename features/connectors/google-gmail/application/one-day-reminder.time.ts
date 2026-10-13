const TIME_ZONE = "America/Santiago";

export function chileEventInstant(eventDate: string, eventTime: string): Date {
  const canonical = `${eventDate.slice(0, 10)}T${eventTime.slice(0, 8)}`;
  const guess = Date.parse(`${canonical}Z`);
  if (!Number.isFinite(guess)) throw new Error("Fecha/hora de Evento inválida.");
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const get = (type: string) => local.find((part) => part.type === type)?.value ?? "00";
  const represented = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
  return new Date(guess - (represented - guess));
}

export function isWithin24HourWindow(eventDate: string, eventTime: string, reference: Date): boolean {
  const diff = chileEventInstant(eventDate, eventTime).getTime() - reference.getTime();
  return diff >= 23 * 60 * 60 * 1000 && diff < 24 * 60 * 60 * 1000;
}
