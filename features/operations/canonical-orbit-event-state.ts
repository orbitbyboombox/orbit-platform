import { resolveCanonicalStaffCallAt } from "./event-operational-window.ts";

export type CanonicalOrbitEventState = {
  projectId: string;
  orbitEventId: string | null;
  eventDate: string;
  serviceStartAt: string;
  serviceEndAt: string;
  durationHours: number;
  staffCallAt: string;
  staffCallSource: string;
  location: string | null;
  city: string | null;
  publicationStatus: string | null;
  activeAssignments: readonly AssignmentInput[];
};

export type AssignmentInput = {
  id?: string;
  status?: string | null;
  staff_call_at?: string | null;
  staff_call_source?: string | null;
};

export function buildCanonicalOrbitEventState(input: {
  projectId: string;
  orbitEventId?: string | null;
  eventDate: string;
  eventTime?: string | null;
  durationHours?: number | null;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  location?: string | null;
  city?: string | null;
  publicationStatus?: string | null;
  assignments?: readonly AssignmentInput[];
}): CanonicalOrbitEventState {
  const durationHours = Math.max(0, Number(input.durationHours ?? 0));
  const serviceStartAt = input.serviceStartAt ?? `${input.eventDate}T${(input.eventTime ?? "00:00").slice(0, 5)}:00-04:00`;
  const serviceEndAt = input.serviceEndAt ?? new Date(new Date(serviceStartAt).getTime() + durationHours * 3600000).toISOString();
  const activeAssignments = (input.assignments ?? []).filter((assignment) => !["CANCELLED", "REJECTED"].includes(String(assignment.status ?? "").toUpperCase()));
  const call = resolveCanonicalStaffCallAt({
    serviceStartAt,
    overrides: activeAssignments.map((assignment) => ({ value: assignment.staff_call_at, source: assignment.staff_call_source })),
  });
  return { projectId: input.projectId, orbitEventId: input.orbitEventId ?? null, eventDate: input.eventDate, serviceStartAt, serviceEndAt, durationHours, staffCallAt: call.staffCallAt, staffCallSource: call.source, location: input.location ?? null, city: input.city ?? null, publicationStatus: input.publicationStatus ?? null, activeAssignments };
}
