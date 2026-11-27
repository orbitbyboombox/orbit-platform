import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerPurchaseOrderDriveFileName } from "@/features/commercial-documents/customer-purchase-order.model";
import { eventDigitalPhotoTemplateDriveFileName } from "@/features/event-digital-photo-template/model";
import { photoStripDriveFileName } from "@/features/photo-strip-design/model";
import { loadGoogleWorkspaceAccessToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";
import { archiveVerifiedDriveFile } from "./google-drive-document-routing.service";
import { resolveAutomaticDestination } from "./google-drive-folder-strategy";
import type { GoogleDriveDocumentKind } from "../types/google-drive-live.types";
import type { ReservationDriveFolderResult } from "./google-drive-sync.service";

const documentKinds = new Map<string, GoogleDriveDocumentKind>([
  ["AGREEMENT", "CONTRACT"],
  ["COMMERCIAL_DOCUMENT", "CONTRACT"],
  ["SIGNED_AGREEMENT", "CONTRACT"],
  ["QUOTATION", "QUOTATION"],
  ["CUSTOMER_PURCHASE_ORDER", "PURCHASE_ORDER"],
  ["DESIGN", "DESIGN"],
  ["EVENT_DIGITAL_PHOTO_TEMPLATE", "DESIGN"],
  ["PHOTO_STRIP_DESIGN", "DESIGN"],
  ["EXTERNAL_TAX_DOCUMENT", "INVOICE"],
  ["INVOICE", "INVOICE"],
  ["PAYMENT_RECEIPT", "PAYMENT_PROOF"],
  ["STAFF_EXPENSE_RECEIPT", "PAYMENT_PROOF"],
  ["PHOTOGRAPH", "PHOTO"],
  ["PHOTO", "PHOTO"],
  ["VIDEO", "VIDEO"],
  ["OTHER_DOCUMENT", "OTHER_DOCUMENT"],
]);

type RecoverableDocument = {
  id: string;
  document_type: string;
  storage_bucket: string | null;
  storage_path: string | null;
  checksum: string | null;
  file_size: number | null;
  original_filename: string | null;
  mime_type: string | null;
  metadata: unknown;
  version: number | null;
};

function preferredFileName(document: RecoverableDocument, orbitEventId: string, fallback: string) {
  const originalFilename = fallback;
  switch (document.document_type) {
    case "PHOTO_STRIP_DESIGN":
      return photoStripDriveFileName({ orbitEventId, originalFilename, version: Number(document.version ?? 1) });
    case "EVENT_DIGITAL_PHOTO_TEMPLATE":
      return eventDigitalPhotoTemplateDriveFileName({ orbitEventId, originalFilename, version: Number(document.version ?? 1) });
    case "CUSTOMER_PURCHASE_ORDER":
      return customerPurchaseOrderDriveFileName({ orbitEventId, originalFilename, documentId: document.id });
    default:
      return originalFilename;
  }
}

export async function recoverPendingEventDocuments(input: {
  client: SupabaseClient;
  projectId: string;
  eventFolder: ReservationDriveFolderResult;
}) {
  const { client, projectId, eventFolder } = input;
  const { data: project, error: projectError } = await client.from("projects")
    .select("orbit_event_id,event_date,name,operations")
    .eq("id", projectId).is("deleted_at", null).single();
  if (projectError) throw projectError;
  const actualLink = project.operations?.googleDrive;
  if (actualLink?.folderId !== eventFolder.folderId || actualLink.path !== eventFolder.folderPath) {
    throw new Error("La carpeta vinculada del evento cambió durante la sincronización.");
  }

  const { count: linkedPending, error: linkedError } = await client.from("documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId).is("deleted_at", null).not("drive_file_id", "is", null)
    .in("drive_sync_status", ["PENDING", "ERROR"]);
  if (linkedError) throw linkedError;
  const { data, count, error } = await client.from("documents")
    .select("id,document_type,storage_bucket,storage_path,checksum,file_size,original_filename,mime_type,metadata,version", { count: "exact" })
    .eq("project_id", projectId).is("deleted_at", null).is("drive_file_id", null)
    .order("id").limit(20);
  if (error) throw error;
  const documents = (data ?? []) as RecoverableDocument[];
  const failures: Array<{ documentId: string; type: string; reason: string }> = [];
  if (!documents.length) return { synced: 0, reused: 0, pending: (count ?? 0) + (linkedPending ?? 0), linkedPending: linkedPending ?? 0, failures };
  const provider = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
  let synced = 0;
  let reused = 0;
  for (const document of documents) {
    try {
      const kind = documentKinds.get(document.document_type);
      if (!kind) throw new Error("El tipo documental no tiene un destino verificado.");
      if (!document.storage_path || !document.checksum || !document.storage_bucket) {
        throw new Error("Falta el objeto de Storage o su huella SHA-256.");
      }
      const destination = resolveAutomaticDestination({ kind, context: { customerName: project.name, eventDate: project.event_date } });
      const leaf = destination.folderPath.split("/").at(-1);
      if (!leaf) throw new Error("El tipo documental no tiene una carpeta válida.");
      const folder = await provider.findFolder({ name: leaf, parentFolderId: eventFolder.folderId });
      if (!folder) throw new Error("La carpeta de documentos requerida no existe en el evento.");
      const parents = await provider.getFolderParents(folder.id);
      if (parents.length !== 1 || parents[0] !== eventFolder.folderId) throw new Error("El destino documental no pertenece a este evento.");

      const { data: source, error: sourceError } = await client.storage.from(document.storage_bucket).download(document.storage_path);
      if (sourceError || !source) throw new Error("No se pudo recuperar el objeto original de Storage.");
      const bytes = new Uint8Array(await source.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (checksum !== document.checksum || (document.file_size != null && Number(document.file_size) !== bytes.byteLength)) {
        throw new Error("El objeto de Storage no coincide con el tamaño o SHA-256 registrado.");
      }
      const sourceName = document.original_filename || document.storage_path.split("/").at(-1) || "";
      const filename = sourceName.trim().replace(/[\\/\x00-\x1f]+/g, "-");
      if (!filename || filename === "." || filename === "..") throw new Error("El documento no tiene un nombre de archivo válido.");
      const name = preferredFileName(document, project.orbit_event_id, filename);
      const file = await archiveVerifiedDriveFile({
        provider,
        folderId: folder.id,
        name,
        mimeType: document.mime_type || source.type || "application/octet-stream",
        bytes,
      });
      const time = new Date().toISOString();
      const metadata = document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
        ? document.metadata
        : {};
      const { data: updated, error: updateError } = await client.from("documents").update({
        drive_file_id: file.id,
        drive_folder_id: folder.id,
        drive_sync_status: "SYNCED",
        drive_sync_error: null,
        drive_synced_at: time,
        metadata: { ...metadata, driveArchiveStatus: "ARCHIVED", driveArchiveError: null, driveFolderPath: `${eventFolder.folderPath}/${leaf}`, driveFileName: file.name, driveReused: file.reused, driveSyncedAt: time },
      }).eq("id", document.id).eq("project_id", projectId).eq("checksum", document.checksum)
        .eq("storage_path", document.storage_path).is("deleted_at", null).is("drive_file_id", null)
        .select("id").maybeSingle();
      if (updateError || !updated) throw new Error("El documento cambió mientras se sincronizaba. La referencia previa se conservó.");
      synced += 1;
      if (file.reused) reused += 1;
    } catch (error) {
      failures.push({ documentId: document.id, type: document.document_type, reason: error instanceof Error ? error.message : "No fue posible recuperar este documento." });
    }
  }
  return { synced, reused, pending: (count ?? documents.length) - synced + (linkedPending ?? 0), linkedPending: linkedPending ?? 0, failures };
}
