import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { synchronizeConfirmedReservationCalendar } from "./google-calendar-sync.service";

/** Re-sync only existing mapped events. Never create new client-facing calendar entries. */
export async function processPendingCalendarChanges(client: SupabaseClient, limit = 20) {
  const now = new Date().toISOString();
  const { data: rows, error } = await client.from("calendar_sync")
    .select("id,project_id,status,nova_external_event_id,external_event_id,retry_count")
    .in("status", ["STALE", "PENDING", "FAILED"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("updated_at", { ascending: true }).limit(limit);
  if (error) throw error;
  const result = { processed: 0, synchronized: 0, failed: 0, skipped: 0 };
  for (const row of rows ?? []) {
    if (!row.external_event_id && !row.nova_external_event_id) { result.skipped++; continue; }
    const { data: claimed, error: claimError } = await client.rpc("claim_calendar_sync_for_resync", { p_sync_id: row.id });
    if (claimError || claimed !== true) { result.skipped++; continue; }
    result.processed++;
    try {
      const synced = await synchronizeConfirmedReservationCalendar({
        client, projectId: row.project_id, actorId: "00000000-0000-0000-0000-000000000000", onlyExisting: true,
      });
      if (!synced) throw new Error("EXISTING_MAPPING_NOT_FOUND");
      const { data: project, error: revisionError } = await client.from("projects")
        .select("event_revision").eq("id", row.project_id).single();
      if (revisionError) throw revisionError;
      const { error: finishError } = await client.from("calendar_sync").update({
        status: "SYNCHRONIZED", last_synced_event_revision: project.event_revision,
        current_event_revision: project.event_revision, retry_count: 0, next_retry_at: null,
        sync_started_at: null, last_error: null, last_error_code: null,
        last_synced_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (finishError) throw finishError;
      result.synchronized++;
    } catch (err) {
      const attempts = Number(row.retry_count ?? 0) + 1;
      const seconds = Math.min(3600, 60 * 2 ** Math.min(attempts - 1, 6));
      await client.from("calendar_sync").update({
        status: "FAILED", retry_count: attempts, sync_started_at: null,
        next_retry_at: new Date(Date.now() + seconds * 1000).toISOString(),
        last_error: { message: err instanceof Error ? err.message.slice(0, 350) : "Calendar sync failed" },
        last_error_code: "RESYNC_FAILED",
      }).eq("id", row.id);
      result.failed++;
    }
  }
  return result;
}
