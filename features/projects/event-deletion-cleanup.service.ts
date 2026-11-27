import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteCalendarEventForProject } from "@/features/connectors/google-calendar/application/google-calendar-delete.service";

type CleanupJob = { id:string; project_id:string; status:string; external_cleanup:Record<string, unknown>; attempt_count:number; actor_id?:string|null };
const arrayOfStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const serializeError = (error: unknown) => ({
  code: "EXTERNAL_CLEANUP_FAILED",
  message: error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error),
  details: error instanceof Error ? error.stack ?? null : null,
});

export async function processEventDeletionJobs(limit = 20) {
  const client = createAdminClient();
  const { data: jobs, error } = await client.from("event_deletion_jobs").select("id,project_id,status,external_cleanup,attempt_count,actor_id").in("status", ["REMOVED_FROM_OPERATION", "EXTERNAL_CLEANUP", "FAILED", "FAILED_RETRYABLE"]).lte("next_retry_at", new Date().toISOString()).order("requested_at").limit(limit);
  if (error) throw error;
  const results: Array<Record<string, unknown>> = [];
  for (const job of (jobs ?? []) as CleanupJob[]) {
    const correlationId = `event-deletion-cleanup:${job.id}`;
    try {
      await client.from("event_deletion_jobs").update({ status: "EXTERNAL_CLEANUP", attempt_count: job.attempt_count + 1, last_error: null }).eq("id", job.id);
      const cleanup = job.external_cleanup ?? {};
      const calendarIds = arrayOfStrings(cleanup.calendarEventIds);
      const calendarResult = await deleteCalendarEventForProject({ client, projectId: job.project_id, eventIds: calendarIds, actorId: job.actor_id });
      console.log(JSON.stringify({ level: "info", event: "event_deletion_cleanup.calendar", jobId: job.id, projectId: job.project_id, status: calendarResult.status, googleEventIds: calendarResult.googleEventIds.length }));
      // Event cleanup preserves historical client files, including shared folders.
      console.info(JSON.stringify({
        event: "event_deletion_cleanup.client_files_preserved",
        jobId: job.id,
        projectId: job.project_id,
        driveFiles: arrayOfStrings(cleanup.driveFileIds).length,
        driveFolders: arrayOfStrings(cleanup.driveFolderIds).length,
        storageObjects: Array.isArray(cleanup.storageObjects) ? cleanup.storageObjects.length : 0,
      }));
      const finalStatus = "COMPLETED";
      const { error: completedError } = await client.from("event_deletion_jobs").update({ status: finalStatus, completed_at: new Date().toISOString(), next_retry_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      if (completedError) throw completedError;
      results.push({ jobId: job.id, status: finalStatus, residualCount: 0, correlationId });
    } catch (error) {
      const details = serializeError(error);
      const nextRetry = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(job.attempt_count, 8) * 1000));
      const failureStatus = "FAILED_RETRYABLE";
      await client.from("event_deletion_jobs").update({ status: failureStatus, next_retry_at: nextRetry.toISOString(), last_error: { ...details, projectId: job.project_id, cleanupStage: "EXTERNAL_CLEANUP", integration: "GOOGLE_CALENDAR", correlationId } }).eq("id", job.id);
      results.push({ jobId: job.id, status: failureStatus, correlationId, error: details });
    }
  }
  return results;
}
