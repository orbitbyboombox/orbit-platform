import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCanonicalOrbitEventState, type CanonicalAssignmentRow, type CanonicalOrbitEventState, type CanonicalProjectRow } from "./canonical-event-state-core";
export type { CanonicalOrbitEventState } from "./canonical-event-state-core";

export async function getCanonicalOrbitEventStates(client: SupabaseClient, projectIds: readonly string[]): Promise<Map<string, CanonicalOrbitEventState>> {
  const ids = [...new Set(projectIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const [{ data: projects, error: projectError }, { data: assignments, error: assignmentError }] = await Promise.all([
    client.from("projects").select("id,event_date,event_time,location,city,project_services(duration_hours),project_operational_contracts(service_start_at,service_end_at)").in("id", ids),
    client.from("assignments").select("project_id,staff_call_at,staff_call_source,status").in("project_id", ids).is("deleted_at", null).not("status", "in", "(CANCELLED,REJECTED)"),
  ]);
  if (projectError) throw projectError;
  if (assignmentError) throw assignmentError;
  const result = new Map<string, CanonicalOrbitEventState>();
  for (const row of (projects ?? []) as CanonicalProjectRow[]) {
    result.set(row.id, buildCanonicalOrbitEventState(row, (assignments ?? []).filter(item => item.project_id === row.id) as CanonicalAssignmentRow[]));
  }
  return result;
}

export async function getCanonicalOrbitEventState(client: SupabaseClient, projectId: string) {
  return (await getCanonicalOrbitEventStates(client, [projectId])).get(projectId) ?? null;
}
