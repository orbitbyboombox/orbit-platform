import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { synchronizeConfirmedReservationCalendar } from "./google-calendar-sync.service";
import { hashCanonicalCalendarFingerprint } from "./canonical-calendar-fingerprint";

type QueueRow = { id: string; project_id: string; orbit_event_id: string; status: string; next_retry_at: string | null; sync_started_at: string | null; external_event_id: string | null; nova_external_event_id: string | null };

/** Marks a persisted mapping stale after a canonical operational edit. */
export async function invalidateCalendarSyncForCanonicalChange(input: { client: SupabaseClient; projectId: string; currentPayloadHash: string }): Promise<void> {
  const { data, error } = await input.client.from("calendar_sync").select("id,last_synced_payload_hash,status").eq("project_id", input.projectId).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const status = data.last_synced_payload_hash === input.currentPayloadHash ? "SYNCHRONIZED" : "STALE";
  const { error: updateError } = await input.client.from("calendar_sync").update({ current_payload_hash: input.currentPayloadHash, status, sync_started_at: null, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (updateError) throw updateError;
}

/** Loads the final persisted operational state and invalidates exactly once. */
export async function invalidateCalendarSyncForProject(client: SupabaseClient, projectId: string): Promise<void> {
  const [{ data: project }, { data: contract }, { data: assignments }] = await Promise.all([
    client.from("projects").select("orbit_event_id,location,event_date,event_time,operations,project_services(duration_hours)").eq("id", projectId).maybeSingle(),
    client.from("project_operational_contracts").select("service_start_at,service_end_at").eq("project_id", projectId).maybeSingle(),
    client.from("assignments").select("staff_call_at,staff_call_source,status").eq("project_id", projectId).is("deleted_at", null),
  ]);
  if (!project) return;
  const ops = (project.operations ?? {}) as Record<string, unknown>;
  const serviceStart = contract?.service_start_at ?? (typeof ops.service_start_at === "string" ? ops.service_start_at : `${project.event_date}T${String(project.event_time ?? "00:00").slice(0, 5)}:00`);
  const duration = Number((Array.isArray(project.project_services) ? project.project_services[0] : project.project_services)?.duration_hours ?? 0);
  const serviceEnd = contract?.service_end_at ?? new Date(new Date(serviceStart).getTime() + duration * 3600000).toISOString();
  const active = (assignments ?? []).filter((item) => !["CANCELLED", "REJECTED"].includes(item.status));
  const call = active.find((item) => item.staff_call_at)?.staff_call_at ?? new Date(new Date(serviceStart).getTime() - 3600000).toISOString();
  await invalidateCalendarSyncForCanonicalChange({ client, projectId, currentPayloadHash: hashCanonicalCalendarFingerprint({ orbitEventId: project.orbit_event_id, serviceStartAt: serviceStart, serviceEndAt: serviceEnd, staffCallAt: call, staffCallSource: active.find((item) => item.staff_call_at)?.staff_call_source ?? "DEFAULT_60_MINUTES", location: project.location }) });
}

/** Processes only existing remote mappings. It never creates a Google event. */
export async function syncStaleGoogleCalendarEvents(input: { client: SupabaseClient; actorId: string; batchSize?: number }): Promise<{ claimed: number; synchronized: number; failed: number; skipped: number }> {
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 25, 100));
  const now = new Date().toISOString();
  const { data: rows, error } = await input.client.from("calendar_sync").select("id,project_id,orbit_event_id,status,next_retry_at,sync_started_at,external_event_id,nova_external_event_id").in("status", ["PENDING", "STALE", "FAILED"]).or(`next_retry_at.is.null,next_retry_at.lte.${now}`).order("updated_at", { ascending: true }).limit(batchSize);
  if (error) throw error;
  const summary = { claimed: 0, synchronized: 0, failed: 0, skipped: 0 };
  for (const row of (rows ?? []) as QueueRow[]) {
    if (!row.external_event_id && !row.nova_external_event_id) { summary.skipped++; continue; }
    const { data: claimed, error: claimError } = await input.client.rpc("claim_calendar_sync_for_resync", { p_sync_id: row.id, p_now: now });
    if (claimError || claimed !== true) { summary.skipped++; continue; }
    summary.claimed++;
    try {
      const result = await synchronizeConfirmedReservationCalendar({ client: input.client, projectId: row.project_id, actorId: input.actorId, policy: "EXISTING_LEGACY_UPDATE" });
      if (!result) throw new Error("CALENDAR_MAPPING_MISSING");
      const { data: current } = await input.client.from("calendar_sync").select("current_payload_hash").eq("id", row.id).maybeSingle();
      await input.client.from("calendar_sync").update({ status: "SYNCHRONIZED", retry_count: 0, next_retry_at: null, sync_started_at: null, last_error: null, last_error_code: null, last_synced_payload_hash: current?.current_payload_hash ?? null }).eq("id", row.id);
      summary.synchronized++;
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "Calendar resync failed";
      const retryCount = 1;
      await input.client.from("calendar_sync").update({ status: "FAILED", retry_count: retryCount, next_retry_at: new Date(Date.now() + 60_000).toISOString(), sync_started_at: null, last_error: { message }, last_error_code: "RESYNC_FAILED" }).eq("id", row.id);
      summary.failed++;
    }
  }
  return summary;
}
