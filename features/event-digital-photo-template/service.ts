import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { eventDigitalPhotoTemplateDriveFileName, EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE } from "./model";

export async function archiveEventDigitalPhotoTemplate(input: { admin: SupabaseClient; documentId: string; bytes?: Uint8Array }) {
  const { data: document, error } = await input.admin.from("documents").select("id,project_id,storage_bucket,storage_path,original_filename,mime_type,version,metadata,projects!inner(orbit_event_id,event_date,customers!inner(full_name))").eq("id", input.documentId).eq("document_type", EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE).is("deleted_at", null).single();
  if (error) throw error;
  const project = Array.isArray(document.projects) ? document.projects[0] : document.projects;
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  let bytes = input.bytes;
  if (!bytes) {
    const downloaded = await input.admin.storage.from(document.storage_bucket || "orbit-documents").download(document.storage_path);
    if (downloaded.error) throw downloaded.error;
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  }
  const drive = await archiveReservationDocumentToDrive({
    client: input.admin,
    projectId: document.project_id,
    customerName: customer.full_name,
    eventDate: project.event_date,
    kind: "DESIGN",
    name: eventDigitalPhotoTemplateDriveFileName({ orbitEventId: project.orbit_event_id, version: Number(document.version), originalFilename: document.original_filename || "template" }),
    mimeType: document.mime_type || "application/octet-stream",
    bytes,
  });
  const metadata = document.metadata && typeof document.metadata === "object" ? document.metadata : {};
  const syncedAt = new Date().toISOString();
  const { error: updateError } = await input.admin.from("documents").update({ drive_file_id: drive.id, drive_folder_id: drive.folderId, drive_sync_status: "SYNCED", drive_sync_error: null, drive_synced_at: syncedAt, metadata: { ...metadata, driveArchiveStatus: "ARCHIVED", driveFolderPath: drive.folderPath, driveFileName: drive.name ?? null, driveReused: drive.reused, driveSyncedAt: syncedAt } }).eq("id", document.id);
  if (updateError) throw updateError;
  return { driveFileId: drive.id, reused: drive.reused, folderPath: drive.folderPath };
}

export async function recordEventDigitalPhotoTemplateDriveFailure(admin: SupabaseClient, documentId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : "Error de Google Drive").slice(0, 1000);
  const { data } = await admin.from("documents").select("metadata").eq("id", documentId).maybeSingle();
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  await admin.from("documents").update({ drive_sync_status: "ERROR", drive_sync_error: message, metadata: { ...metadata, driveArchiveStatus: "ERROR", driveArchiveError: message } }).eq("id", documentId);
}
