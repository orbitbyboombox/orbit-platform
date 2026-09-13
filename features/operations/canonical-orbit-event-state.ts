import { chileLocalToIso, resolveCanonicalStaffCallAt } from "./event-operational-window.ts";

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

/** Builds the canonical read model from the shapes returned by Supabase joins. */
export function buildCanonicalOrbitEventStateFromRecord(record: {
  id?: string;
  project_id?: string;
  orbit_event_id?: string | null;
  event_date: string;
  event_time?: string | null;
  location?: string | null;
  city?: string | null;
  operations?: Record<string, unknown> | null;
  project_operational_contracts?: Array<{ service_start_at?: string | null; service_end_at?: string | null }> | { service_start_at?: string | null; service_end_at?: string | null } | null;
  assignments?: readonly AssignmentInput[];
  duration_hours?: number | null;
}): CanonicalOrbitEventState {
  const operations = record.operations ?? {};
  const contract = Array.isArray(record.project_operational_contracts)
    ? record.project_operational_contracts[0]
    : record.project_operational_contracts;
  const serviceStartAt = contract?.service_start_at ?? (typeof operations.service_start_at === "string" ? operations.service_start_at : null);
  const serviceEndAt = contract?.service_end_at ?? (typeof operations.service_end_at === "string" ? operations.service_end_at : null);
  return buildCanonicalOrbitEventState({
    projectId: record.project_id ?? record.id ?? "",
    orbitEventId: record.orbit_event_id,
    eventDate: record.event_date,
    eventTime: record.event_time,
    durationHours: record.duration_hours,
    serviceStartAt,
    serviceEndAt,
    location: record.location,
    city: record.city,
    publicationStatus: typeof operations.publicationStatus === "string" ? operations.publicationStatus : null,
    assignments: record.assignments,
  });
}

export function canonicalStaffCallGuard(state: Pick<CanonicalOrbitEventState, "serviceStartAt" | "staffCallAt" | "staffCallSource">): "OK" | "STAFF_CALL_INCONSISTENT" {
  if (state.staffCallSource === "FOUNDER_OVERRIDE") return "OK";
  const expected = resolveCanonicalStaffCallAt({ serviceStartAt: state.serviceStartAt }).staffCallAt;
  return new Date(expected).getTime() === new Date(state.staffCallAt).getTime() ? "OK" : "STAFF_CALL_INCONSISTENT";
}

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
  const serviceStartAt = input.serviceStartAt ?? chileLocalToIso(`${input.eventDate}T${(input.eventTime ?? "00:00").slice(0, 5)}:00`);
  const serviceEndAt = input.serviceEndAt ?? new Date(new Date(serviceStartAt).getTime() + durationHours * 3600000).toISOString();
  const activeAssignments = (input.assignments ?? []).filter((assignment) => !["CANCELLED", "REJECTED"].includes(String(assignment.status ?? "").toUpperCase()));
  const call = resolveCanonicalStaffCallAt({
    serviceStartAt,
    overrides: activeAssignments.map((assignment) => ({ value: assignment.staff_call_at, source: assignment.staff_call_source })),
  });
  return { projectId: input.projectId, orbitEventId: input.orbitEventId ?? null, eventDate: input.eventDate, serviceStartAt, serviceEndAt, durationHours, staffCallAt: call.staffCallAt, staffCallSource: call.source, location: input.location ?? null, city: input.city ?? null, publicationStatus: input.publicationStatus ?? null, activeAssignments };
}
