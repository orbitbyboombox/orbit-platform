export type CanonicalStaffCallSource = "MANUAL_OVERRIDE" | "CANONICAL_MINUS_90";
export type CanonicalOrbitEventState = { projectId: string; serviceStartAt: string; serviceEndAt: string; staffCallAt: string; staffCallSource: CanonicalStaffCallSource; location: string | null; city: string | null };
export type CanonicalProjectRow = { id: string; event_date: string; event_time: string | null; location: string | null; city: string | null; project_services: Array<{ duration_hours: number | null }> | null; project_operational_contracts: { service_start_at: string | null; service_end_at: string | null } | Array<{ service_start_at: string | null; service_end_at: string | null }> | null };
export type CanonicalAssignmentRow = { project_id: string; staff_call_at: string | null; staff_call_source: string | null; status: string };
const relation = <T>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const localStart = (date: string, time: string | null) => `${date}T${String(time ?? "00:00").slice(0, 5)}:00-03:00`;
const addMinutes = (value: string, minutes: number) => new Date(new Date(value).getTime() + minutes * 60000).toISOString();
export function buildCanonicalOrbitEventState(row: CanonicalProjectRow, assignments: readonly CanonicalAssignmentRow[] = []): CanonicalOrbitEventState {
  const contract = relation(row.project_operational_contracts), duration = Math.max(1, ...(row.project_services ?? []).map(item => Number(item.duration_hours ?? 0))), serviceStartAt = contract?.service_start_at ?? localStart(row.event_date, row.event_time), serviceEndAt = contract?.service_end_at ?? addMinutes(serviceStartAt, duration * 60), manualOverride = assignments.find(item => item.staff_call_at && item.staff_call_source === "MANUAL_OVERRIDE");
  return { projectId: row.id, serviceStartAt, serviceEndAt, staffCallAt: manualOverride?.staff_call_at ?? addMinutes(serviceStartAt, -90), staffCallSource: manualOverride ? "MANUAL_OVERRIDE" : "CANONICAL_MINUS_90", location: row.location, city: row.city };
}
