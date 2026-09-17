import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceCalendarId } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleCalendarApiProvider } from "@/features/connectors/google-calendar/provider/google-calendar-live.provider";
import { GoogleDriveApiProvider } from "@/features/connectors/google-drive/provider/google-drive-live.provider";

type CleanupJob = { id:string; project_id:string; status:string; external_cleanup:Record<string, unknown>; attempt_count:number };
const arrayOfStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const serializeError = (error: unknown) => ({
  code: "EXTERNAL_CLEANUP_FAILED",
  message: error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error),
  details: error instanceof Error ? error.stack ?? null : null,
});

async function removeDriveTree(drive: GoogleDriveApiProvider, id: string): Promise<void> {
  const children = await drive.listChildren?.(id) ?? [];
  for (const child of children) {
    if (child.mimeType === "application/vnd.google-apps.folder") await removeDriveTree(drive, child.id);
    else await drive.deleteFile?.(child.id);
  }
  await drive.deleteFile?.(id);
}

export async function processEventDeletionJobs(limit = 20) {
  const client = createAdminClient();
  const { data: jobs, error } = await client.from("event_deletion_jobs").select("id,project_id,status,external_cleanup,attempt_count").in("status", ["REMOVED_FROM_OPERATION", "EXTERNAL_CLEANUP", "FAILED"]).lte("next_retry_at", new Date().toISOString()).order("requested_at").limit(limit);
  if (error) throw error;
  const results: Array<Record<string, unknown>> = [];
  for (const job of (jobs ?? []) as CleanupJob[]) {
    const correlationId = `event-deletion-cleanup:${job.id}`;
    try {
      await client.from("event_deletion_jobs").update({ status: "EXTERNAL_CLEANUP", attempt_count: job.attempt_count + 1, last_error: null }).eq("id", job.id);
      const cleanup = job.external_cleanup ?? {};
      const calendarIds = arrayOfStrings(cleanup.calendarEventIds);
      if (calendarIds.length) {
        const calendar = new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(), await loadGoogleWorkspaceCalendarId());
        for (const id of calendarIds) await calendar.deleteEvent(id);
      }
      const storageObjects = Array.isArray(cleanup.storageObjects) ? cleanup.storageObjects.filter((item): item is { bucket:string; path:string } => Boolean(item) && typeof item === "object" && typeof (item as { bucket?:unknown }).bucket === "string" && typeof (item as { path?:unknown }).path === "string") : [];
      for (const object of storageObjects) await client.storage.from(object.bucket).remove([object.path]);
      const driveFileIds = arrayOfStrings(cleanup.driveFileIds);
      const driveFolderIds = arrayOfStrings(cleanup.driveFolderIds);
      if (driveFileIds.length || driveFolderIds.length) {
        const drive = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
        for (const id of driveFileIds) await drive.deleteFile?.(id);
        for (const id of driveFolderIds) await removeDriveTree(drive, id);
      }
      const { error: completedError } = await client.from("event_deletion_jobs").update({ status: "COMPLETED", completed_at: new Date().toISOString(), next_retry_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      if (completedError) throw completedError;
      results.push({ jobId: job.id, status: "COMPLETED", correlationId });
    } catch (error) {
      const details = serializeError(error);
      const nextRetry = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(job.attempt_count, 8) * 1000));
      await client.from("event_deletion_jobs").update({ status: "FAILED", next_retry_at: nextRetry.toISOString(), last_error: { ...details, projectId: job.project_id, cleanupStage: "EXTERNAL_CLEANUP", integration: "GOOGLE_OR_STORAGE", correlationId } }).eq("id", job.id);
      results.push({ jobId: job.id, status: "FAILED", correlationId, error: details });
    }
  }
  return results;
}
