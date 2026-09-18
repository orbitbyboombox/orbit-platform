import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { deleteCalendarEventForProject } from "@/features/connectors/google-calendar/application/google-calendar-delete.service";
import { GoogleDriveApiProvider } from "@/features/connectors/google-drive/provider/google-drive-live.provider";

type CleanupJob = { id:string; project_id:string; status:string; external_cleanup:Record<string, unknown>; attempt_count:number; actor_id?:string|null };
type CleanupResidual = { provider:"google_drive"; resourceId:string; resourceType:"file"|"folder"; code:string; message:string; owner?:string|null; requiresManualAction:boolean; actionRequired?:string };
const arrayOfStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const serializeError = (error: unknown) => ({
  code: "EXTERNAL_CLEANUP_FAILED",
  message: error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error),
  details: error instanceof Error ? error.stack ?? null : null,
});

const manualDriveError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /appNotAuthorizedToChild|ownership|not.?authorized|insufficient.*permission|forbidden/i.test(message) && /403|appNotAuthorizedToChild|ownership|permission|forbidden/i.test(message);
};

const residual = (resourceId:string, resourceType:"file"|"folder", error:unknown, actionRequired="Eliminación manual por el propietario de Google Drive."): CleanupResidual => ({
  provider: "google_drive",
  resourceId,
  resourceType,
  code: "DRIVE_EXTERNAL_OWNERSHIP",
  message: error instanceof Error ? error.message : String(error),
  owner: null,
  requiresManualAction: true,
  actionRequired,
});

async function removeDriveTree(drive: GoogleDriveApiProvider, id: string, residuals: CleanupResidual[]): Promise<void> {
  let children: Array<{ id:string; mimeType?:string }> = [];
  try { children = await drive.listChildren?.(id) ?? []; }
  catch (error) { if (manualDriveError(error)) { residuals.push(residual(id, "folder", error)); return; } throw error; }
  for (const child of children) {
    try {
      if (child.mimeType === "application/vnd.google-apps.folder") await removeDriveTree(drive, child.id, residuals);
      else await drive.deleteFile?.(child.id);
    } catch (error) {
      if (manualDriveError(error)) residuals.push(residual(child.id, child.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file", error));
      else throw error;
    }
  }
  try { await drive.deleteFile?.(id); }
  catch (error) { if (manualDriveError(error)) residuals.push(residual(id, "folder", error)); else throw error; }
}

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
      const residuals: CleanupResidual[] = [];
      const calendarIds = arrayOfStrings(cleanup.calendarEventIds);
      const calendarResult = await deleteCalendarEventForProject({ client, projectId: job.project_id, eventIds: calendarIds, actorId: job.actor_id });
      console.log(JSON.stringify({ level: "info", event: "event_deletion_cleanup.calendar", jobId: job.id, projectId: job.project_id, status: calendarResult.status, googleEventIds: calendarResult.googleEventIds.length }));
      const storageObjects = Array.isArray(cleanup.storageObjects) ? cleanup.storageObjects.filter((item): item is { bucket:string; path:string } => Boolean(item) && typeof item === "object" && typeof (item as { bucket?:unknown }).bucket === "string" && typeof (item as { path?:unknown }).path === "string") : [];
      for (const object of storageObjects) await client.storage.from(object.bucket).remove([object.path]);
      const driveFileIds = arrayOfStrings(cleanup.driveFileIds);
      const driveFolderIds = arrayOfStrings(cleanup.driveFolderIds);
      if (driveFileIds.length || driveFolderIds.length) {
        const drive = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
        for (const id of driveFileIds) {
          try { await drive.deleteFile?.(id); }
          catch (error) { if (manualDriveError(error)) residuals.push(residual(id, "file", error)); else throw error; }
        }
        // drive_sync historically stored shared parent folders alongside the
        // event folder. Never delete those organization-wide parents.
        const { data: folderRows } = await client.from("drive_sync").select("external_folder_id,destination_key").eq("project_id", job.project_id);
        const destinationById = new Map((folderRows ?? []).map((row) => [String(row.external_folder_id), String(row.destination_key ?? "")]));
        for (const id of driveFolderIds) {
          const destination = destinationById.get(id) ?? "";
          const eventScoped = destination.split("/").length >= 4;
          if (!eventScoped) {
            residuals.push({ provider:"google_drive", resourceId:id, resourceType:"folder", code:"SHARED_PARENT_PRESERVED", message:"Carpeta compartida de organización preservada; no pertenece exclusivamente al evento.", owner:null, requiresManualAction:false });
            continue;
          }
          await removeDriveTree(drive, id, residuals);
        }
      }
      const manualResiduals = residuals.filter((item) => item.requiresManualAction);
      const finalStatus = manualResiduals.length ? "COMPLETED_WITH_EXTERNAL_RESIDUALS" : "COMPLETED";
      const { error: completedError } = await client.from("event_deletion_jobs").update({ status: finalStatus, completed_at: new Date().toISOString(), next_retry_at: new Date().toISOString(), last_error: null, cleanup_residuals: residuals }).eq("id", job.id);
      if (completedError) throw completedError;
      results.push({ jobId: job.id, status: finalStatus, residualCount: manualResiduals.length, correlationId });
    } catch (error) {
      const details = serializeError(error);
      const nextRetry = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(job.attempt_count, 8) * 1000));
      const manual = manualDriveError(error);
      const failureStatus = manual ? "FAILED_MANUAL_ACTION_REQUIRED" : "FAILED_RETRYABLE";
      await client.from("event_deletion_jobs").update({ status: failureStatus, next_retry_at: manual ? new Date().toISOString() : nextRetry.toISOString(), last_error: { ...details, projectId: job.project_id, cleanupStage: "EXTERNAL_CLEANUP", integration: "GOOGLE_OR_STORAGE", correlationId } }).eq("id", job.id);
      results.push({ jobId: job.id, status: failureStatus, correlationId, error: details });
    }
  }
  return results;
}
