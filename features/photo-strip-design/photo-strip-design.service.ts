import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { photoStripDriveFileName, PHOTO_STRIP_DESIGN_TYPE } from "./model";

export async function archivePhotoStripDesign(input: {
  admin: SupabaseClient;
  documentId: string;
  bytes?: Uint8Array;
}) {
  const { data: document, error: documentError } = await input.admin
    .from("documents")
    .select("id,project_id,storage_bucket,storage_path,original_filename,mime_type,version,metadata,projects!inner(orbit_event_id,event_date,customers!inner(full_name))")
    .eq("id", input.documentId)
    .eq("document_type", PHOTO_STRIP_DESIGN_TYPE)
    .is("deleted_at", null)
    .single();
  if (documentError) throw documentError;
  const project = Array.isArray(document.projects) ? document.projects[0] : document.projects;
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  let bytes = input.bytes;
  if (!bytes) {
    const downloaded = await input.admin.storage
      .from(document.storage_bucket || "orbit-documents")
      .download(document.storage_path);
    if (downloaded.error) throw downloaded.error;
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  }
  const driveName = photoStripDriveFileName({
    orbitEventId: project.orbit_event_id,
    version: Number(document.version),
    originalFilename: document.original_filename || "diseno",
  });
  const drive = await archiveReservationDocumentToDrive({
    client: input.admin,
    projectId: document.project_id,
    customerName: customer.full_name,
    eventDate: project.event_date,
    kind: "DESIGN",
    name: driveName,
    mimeType: document.mime_type || "application/octet-stream",
    bytes,
  });
  const metadata = document.metadata && typeof document.metadata === "object" ? document.metadata : {};
  const synchronizedAt = new Date().toISOString();
  const { error: updateError } = await input.admin.from("documents").update({
    drive_file_id: drive.id,
    drive_folder_id: drive.folderId,
    drive_sync_status: "SYNCED",
    drive_sync_error: null,
    drive_synced_at: synchronizedAt,
    metadata: {
      ...metadata,
      protected: true,
      driveArchiveStatus: "ARCHIVED",
      driveFolderPath: drive.folderPath,
      driveFileName: driveName,
      driveReused: drive.reused,
      driveSyncedAt: synchronizedAt,
    },
  }).eq("id", document.id);
  if (updateError) throw updateError;
  return { driveFileId: drive.id, reused: drive.reused, folderPath: drive.folderPath };
}

export async function recordPhotoStripDriveFailure(
  admin: SupabaseClient,
  documentId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "Error de Google Drive";
  const { data } = await admin.from("documents").select("metadata").eq("id", documentId).maybeSingle();
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  await admin.from("documents").update({
    drive_sync_status: "ERROR",
    drive_sync_error: message.slice(0, 1000),
    metadata: { ...metadata, protected: true, driveArchiveStatus: "ERROR", driveArchiveError: message.slice(0, 1000) },
  }).eq("id", documentId);
}
