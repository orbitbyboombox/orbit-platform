import { chileLocalToIso } from "./event-operational-window.ts";

export const SPECIAL_OPERATIONAL_STAFF_IDS = [
  "07683338-3ff1-4235-9253-1efeeed4a7c1",
  "bd31d438-42fc-474a-87b6-a5f68f626fea",
  "353b9538-7d1c-4048-b71f-17854bde78ce",
] as const;

const specialIds = new Set<string>(SPECIAL_OPERATIONAL_STAFF_IDS);
export const SPECIAL_OPERATIONAL_STAFF_MESSAGE =
  "Recuerda que mañana tienes evento BOOMBOX.";

export function isSpecialOperationalStaffId(
  staffId: string | null | undefined,
): boolean {
  return Boolean(staffId && specialIds.has(staffId));
}

export function chileTomorrow(reference: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const next = new Date(
    `${value("year")}-${value("month")}-${value("day")}T12:00:00Z`,
  );
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function isChileD1ReminderWindow(reference: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reference);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const hour = value("hour");
  const minute = value("minute");
  return hour === 19 || (hour === 20 && minute === 0);
}

/**
 * The cron runs hourly. This window is deliberately based on the event's
 * Chilean wall-clock date and time, rather than on a generic "tomorrow at
 * 19:00" slot. The unique notification correlation makes the hourly retry
 * safe while keeping delivery at the D-1 event time.
 */
export function isWithinChileD1Window(
  reference: Date,
  eventDate: string,
  eventTime: string | null | undefined,
): boolean {
  if (!eventDate || !eventTime) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reference);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const nowWallClock = Date.parse(
    `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:00Z`,
  );
  const normalizedTime = eventTime.slice(0, 5);
  const eventWallClock = Date.parse(`${eventDate}T${normalizedTime}:00Z`);
  if (!Number.isFinite(nowWallClock) || !Number.isFinite(eventWallClock)) {
    return false;
  }
  const minutesUntilEvent = (eventWallClock - nowWallClock) / 60000;
  return minutesUntilEvent >= 23 * 60 + 30 && minutesUntilEvent <= 24 * 60 + 30;
}

export type SpecialReminderAssignment = {
  projectId: string;
  staffId: string;
  assignmentStatus: string;
  assignmentDeletedAt: string | null;
  eventDate: string;
  projectStatus: string | null;
  projectDeletedAt: string | null;
  staffStatus: string | null;
  staffDeletedAt: string | null;
  email: string | null;
};

const activeAssignmentStatuses = new Set([
  "PENDING",
  "PENDING_CONFIRMATION",
  "ASSIGNED",
  "CONFIRMED",
  "ACCEPTED",
]);
const closedProjectStatuses = new Set([
  "CANCELLED",
  "CANCELED",
  "CLOSED",
  "ARCHIVED",
]);

export function specialD1Candidates<T extends SpecialReminderAssignment>(
  rows: readonly T[],
  tomorrow: string,
): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (
      !isSpecialOperationalStaffId(row.staffId) ||
      row.assignmentDeletedAt ||
      !activeAssignmentStatuses.has(row.assignmentStatus)
    )
      continue;
    if (
      row.eventDate !== tomorrow ||
      row.projectDeletedAt ||
      closedProjectStatuses.has(String(row.projectStatus ?? "").toUpperCase())
    )
      continue;
    if (row.staffDeletedAt || row.staffStatus !== "ACTIVE" || !row.email)
      continue;
    const key = `${row.projectId}:${row.staffId}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export function specialReminderCorrelation(
  projectId: string,
  staffId: string,
): string {
  return `staff-special-d1:${projectId}:${staffId}`;
}

export type OperationalReminderAssignment = SpecialReminderAssignment & {
  firstName: string;
  eventName: string;
  eventTime: string | null;
  location: string | null;
  role: string;
  customerId: string | null;
  customerName?: string | null;
  service?: string | null;
  staffCallAt?: string | null;
  durationHours?: number;
  instructions?: string | null;
  specialElements?: string[];
};

export type ConsolidatedOperationalRoute = {
  projectId: string;
  eventDate: string;
  eventName: string;
  customerName: string | null;
  service: string | null;
  location: string | null;
  role: string;
  staffCallAt: string | null;
  serviceEndAt: string | null;
  scheduleAt: string | null;
  instructions: string | null;
  specialElements: string[];
};

export type OperationalD1Candidate = Omit<
  OperationalReminderAssignment,
  "instructions" | "specialElements"
> & {
  roles: string[];
  instructions: string[];
  specialElements: string[];
  staffCallTimes: string[];
  routes: ConsolidatedOperationalRoute[];
  projectIds: string[];
};

const serviceEndAt = (row: OperationalReminderAssignment): string | null => {
  if (!row.eventTime || !Number.isFinite(row.durationHours)) return null;
  try {
    return new Date(
      new Date(chileLocalToIso(`${row.eventDate}T${row.eventTime.slice(0, 5)}:00`)).getTime() +
        Number(row.durationHours ?? 0) * 60 * 60 * 1000,
    ).toISOString();
  } catch {
    return null;
  }
};

export function consolidatedOperationalRoute(
  row: OperationalReminderAssignment,
): ConsolidatedOperationalRoute {
  const end = serviceEndAt(row);
  const isAssembly = row.role === "ASSEMBLY";
  const isDisassembly = row.role === "DISASSEMBLY";
  return {
    projectId: row.projectId,
    eventDate: row.eventDate,
    eventName: row.eventName,
    customerName: row.customerName ?? null,
    service: row.service ?? null,
    location: row.location ?? null,
    role: row.role,
    staffCallAt: row.staffCallAt ?? null,
    serviceEndAt: end,
    scheduleAt: isAssembly ? row.staffCallAt ?? null : isDisassembly ? end : row.staffCallAt ?? null,
    instructions: row.instructions ?? null,
    specialElements: [...new Set(row.specialElements ?? [])],
  };
}

const mergeCandidateRow = (
  current: OperationalD1Candidate,
  row: OperationalReminderAssignment,
) => {
  if (!current.roles.includes(row.role)) current.roles.push(row.role);
  if (row.instructions?.trim())
    current.instructions.push(`${row.role}: ${row.instructions.trim()}`);
  for (const element of row.specialElements ?? [])
    if (!current.specialElements.includes(element)) current.specialElements.push(element);
  if (row.staffCallAt && !current.staffCallTimes.includes(row.staffCallAt))
    current.staffCallTimes.push(row.staffCallAt);
  if (!current.projectIds.includes(row.projectId)) current.projectIds.push(row.projectId);
  current.routes.push(consolidatedOperationalRoute(row));
};

export function operationalD1Candidates(
  rows: readonly OperationalReminderAssignment[],
  tomorrow: string,
): OperationalD1Candidate[] {
  const unique = new Map<string, OperationalD1Candidate>();
  for (const row of rows) {
    if (
      row.assignmentDeletedAt ||
      !activeAssignmentStatuses.has(row.assignmentStatus)
    )
      continue;
    if (
      row.eventDate !== tomorrow ||
      row.projectDeletedAt ||
      closedProjectStatuses.has(String(row.projectStatus ?? "").toUpperCase())
    )
      continue;
    if (row.staffDeletedAt || row.staffStatus !== "ACTIVE" || !row.email)
      continue;
    const key = `${row.projectId}:${row.staffId}`;
    const current = unique.get(key);
    if (current) {
      mergeCandidateRow(current, row);
      continue;
    }
    unique.set(key, {
      ...row,
      roles: [row.role],
      instructions: row.instructions?.trim()
        ? [`${row.role}: ${row.instructions.trim()}`]
        : [],
      specialElements: [...new Set(row.specialElements ?? [])],
      staffCallTimes: row.staffCallAt ? [row.staffCallAt] : [],
      routes: [consolidatedOperationalRoute(row)],
      projectIds: [row.projectId],
    });
  }
  return [...unique.values()];
}

/** One next-day message per selected logistics collaborator, across all events. */
export function consolidatedSpecialD1Candidates(
  rows: readonly OperationalReminderAssignment[],
  tomorrow: string,
): OperationalD1Candidate[] {
  const unique = new Map<string, OperationalD1Candidate>();
  for (const row of rows) {
    if (!isSpecialOperationalStaffId(row.staffId) || row.eventDate !== tomorrow) continue;
    if (
      row.assignmentDeletedAt ||
      !activeAssignmentStatuses.has(row.assignmentStatus) ||
      row.projectDeletedAt ||
      closedProjectStatuses.has(String(row.projectStatus ?? "").toUpperCase()) ||
      row.staffDeletedAt ||
      row.staffStatus !== "ACTIVE" ||
      !row.email
    ) continue;
    const key = row.staffId;
    const current = unique.get(key);
    if (current) {
      mergeCandidateRow(current, row);
      continue;
    }
    unique.set(key, {
      ...row,
      roles: [row.role],
      instructions: row.instructions?.trim() ? [`${row.role}: ${row.instructions.trim()}`] : [],
      specialElements: [...new Set(row.specialElements ?? [])],
      staffCallTimes: row.staffCallAt ? [row.staffCallAt] : [],
      routes: [consolidatedOperationalRoute(row)],
      projectIds: [row.projectId],
    });
  }
  for (const candidate of unique.values()) {
    candidate.routes.sort((left, right) => {
      if (!left.scheduleAt) return 1;
      if (!right.scheduleAt) return -1;
      return new Date(left.scheduleAt).getTime() - new Date(right.scheduleAt).getTime();
    });
  }
  return [...unique.values()];
}

export function consolidatedSpecialReminderCorrelation(staffId: string, tomorrow: string): string {
  return `staff-special-d1:${staffId}:${tomorrow}`;
}

export function operationalReminderCorrelation(
  projectId: string,
  staffId: string,
): string {
  return isSpecialOperationalStaffId(staffId)
    ? specialReminderCorrelation(projectId, staffId)
    : `staff-d1:${projectId}:${staffId}`;
}
