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
};

export type OperationalD1Candidate = OperationalReminderAssignment & {
  roles: string[];
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
      if (!current.roles.includes(row.role)) current.roles.push(row.role);
      continue;
    }
    unique.set(key, { ...row, roles: [row.role] });
  }
  return [...unique.values()];
}

export function operationalReminderCorrelation(
  projectId: string,
  staffId: string,
): string {
  return isSpecialOperationalStaffId(staffId)
    ? specialReminderCorrelation(projectId, staffId)
    : `staff-d1:${projectId}:${staffId}`;
}
