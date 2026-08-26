import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { customerPurchaseOrderDriveFileName, operationalErrorMessage } from "./customer-purchase-order.model";

export async function archiveCustomerPurchaseOrder(input: {
  admin: SupabaseClient;
  documentId: string;
  bytes?: Uint8Array;
}) {
  const { data: document, error: documentError } = await input.admin
    .from("documents")
    .select("id,project_id,storage_bucket,storage_path,original_filename,mime_type,metadata,projects!inner(orbit_event_id,event_date,customers!inner(full_name))")
    .eq("id", input.documentId)
    .eq("document_type", "CUSTOMER_PURCHASE_ORDER")
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
  const driveName = customerPurchaseOrderDriveFileName({
    documentId: document.id,
    orbitEventId: project.orbit_event_id,
    originalFilename: document.original_filename || "oc-cliente",
  });
  const drive = await archiveReservationDocumentToDrive({
    client: input.admin,
    projectId: document.project_id,
    customerName: customer.full_name,
    eventDate: project.event_date,
    kind: "PURCHASE_ORDER",
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
  return { driveFileId: drive.id, folderPath: drive.folderPath, reused: drive.reused };
}

export async function recordCustomerPurchaseOrderDriveFailure(
  admin: SupabaseClient,
  documentId: string,
  error: unknown,
) {
  const message = operationalErrorMessage(error, "Error de Google Drive").slice(0, 1000);
  const { data } = await admin.from("documents").select("metadata").eq("id", documentId).maybeSingle();
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  await admin.from("documents").update({
    drive_sync_status: "ERROR",
    drive_sync_error: message,
    metadata: {
      ...metadata,
      protected: true,
      driveArchiveStatus: "ERROR",
      driveArchiveError: message,
    },
  }).eq("id", documentId);
}
