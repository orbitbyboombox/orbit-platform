import type {
  Clock,
  CountdownVisualState,
  CurrentTimeContext,
  EventCountdown,
  EventTimeInput,
  EventTimeIntelligence,
  Greeting,
  OperationalPhase,
  OperationalTimelineResult,
} from "../types/time-intelligence.types";

export const ORBIT_TIME_ZONE = "America/Santiago";

const DAY_MS = 86_400_000;

const PHASE_PRESENTATION: Record<OperationalPhase, { label: string; nextAction: string }> = {
  PLANNING: { label: "Planificación", nextAction: "Continuar planificación del evento." },
  REQUEST_ARTWORK: { label: "Solicitar arte", nextAction: "Solicitar arte de branding." },
  CONFIRM_INFORMATION: { label: "Confirmar información", nextAction: "Confirmar información del evento." },
  CONFIRM_PAYMENT: { label: "Confirmar pago", nextAction: "Confirmar pago pendiente." },
  ASSIGN_RESOURCES: { label: "Asignar recursos operacionales", nextAction: "Confirmar operador y transporte." },
  GENERATE_DAILY_PLAN: { label: "Generar plan diario", nextAction: "Generar Plan Diario de Operaciones." },
  REVIEW_LOGISTICS: { label: "Revisar logística", nextAction: "Revisar logística del evento." },
  FINAL_CHECKLIST: { label: "Checklist final", nextAction: "Completar checklist final." },
  OPERATIONAL_EXECUTION: { label: "Ejecución operacional", nextAction: "Iniciar ejecución operacional." },
  ARCHIVE: { label: "Archivo", nextAction: "Archivar experiencia finalizada." },
};

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return new Date(this.value.getTime());
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid event date: ${value}`);
  return { year, month, day };
}

function calendarDayNumber(parts: { year: number; month: number; day: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}

export function resolveGreeting(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function resolveVisualState(days: number, state: EventCountdown["state"]): CountdownVisualState {
  if (state === "ARCHIVED") return "ARCHIVED";
  if (state === "COMPLETED") return "COMPLETED";
  if (days === 0) return "PRIMARY";
  if (days >= 1 && days <= 6) return "RED";
  if (days >= 7 && days <= 29) return "ORANGE";
  if (days >= 30 && days <= 90) return "YELLOW";
  return "GREEN";
}

export function resolveOperationalPhase(days: number, state: EventCountdown["state"]): OperationalTimelineResult {
  let phase: OperationalPhase;
  if (state === "COMPLETED" || state === "ARCHIVED" || days < 0) phase = "ARCHIVE";
  else if (days === 0) phase = "OPERATIONAL_EXECUTION";
  else if (days === 1) phase = "FINAL_CHECKLIST";
  else if (days <= 3) phase = "REVIEW_LOGISTICS";
  else if (days <= 7) phase = "GENERATE_DAILY_PLAN";
  else if (days <= 15) phase = "ASSIGN_RESOURCES";
  else if (days <= 30) phase = "CONFIRM_PAYMENT";
  else if (days <= 60) phase = "CONFIRM_INFORMATION";
  else if (days <= 90) phase = "REQUEST_ARTWORK";
  else phase = "PLANNING";
  return { phase, phaseLabel: PHASE_PRESENTATION[phase].label, nextAction: PHASE_PRESENTATION[phase].nextAction };
}

export class TimeIntelligenceEngine {
  constructor(
    private readonly clock: Clock,
    private readonly timeZone = ORBIT_TIME_ZONE,
  ) {}

  getCurrentContext(userName: string): CurrentTimeContext {
    const now = this.clock.now();
    const parts = zonedParts(now, this.timeZone);
    const greeting = resolveGreeting(parts.hour);
    const rawFormattedDate = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: this.timeZone }).format(now);
    const formattedDate = `${rawFormattedDate.charAt(0).toLocaleUpperCase("es-CL")}${rawFormattedDate.slice(1)}`;
    return {
      now,
      localDate: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
      localTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
      formattedDate,
      greeting,
      greetingText: `${greeting}, ${userName}.`,
      todaySummary: "Resumen operacional de hoy.",
      timeZone: this.timeZone,
    };
  }

  getCountdown(input: EventTimeInput): EventCountdown {
    const current = zonedParts(this.clock.now(), this.timeZone);
    const event = parseDateOnly(input.eventDate);
    const days = calendarDayNumber(event) - calendarDayNumber(current);
    const state = input.archived ? "ARCHIVED" : input.completed || days < 0 ? "COMPLETED" : days === 0 ? "TODAY" : "FUTURE";
    const label = state === "ARCHIVED" ? "Archivado" : state === "COMPLETED" ? "Finalizado" : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
    return { days, label, state, visualState: resolveVisualState(days, state) };
  }

  getEventIntelligence(input: EventTimeInput): EventTimeIntelligence {
    const countdown = this.getCountdown(input);
    return { countdown, timeline: resolveOperationalPhase(countdown.days, countdown.state) };
  }

  addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
  }

  formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat("es-CL", { ...options, timeZone: this.timeZone }).format(date);
  }

  isDateInRange(dateOnly: string, start: Date, end: Date): boolean {
    const event = parseDateOnly(dateOnly);
    const startParts = zonedParts(start, this.timeZone);
    const endParts = zonedParts(end, this.timeZone);
    const eventDay = calendarDayNumber(event);
    return eventDay >= calendarDayNumber(startParts) && eventDay < calendarDayNumber(endParts);
  }
}

export const ORBIT_TIME_ENGINE = new TimeIntelligenceEngine(new SystemClock());
