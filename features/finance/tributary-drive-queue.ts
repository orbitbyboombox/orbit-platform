import "server-only";

import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTributaryDriveArchive } from "./tributary-drive-archive";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;

export async function processTributaryDriveQueue() {
  const admin = createAdminClient();
  const archive = createTributaryDriveArchive(await loadGoogleWorkspaceAccessToken());
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const { data: rows, error } = await admin.from("tributary_drive_sync_items")
    .select("id,document_id,project_id,customer_id,artifact_kind,attempt_count,status,updated_at,drive_file_id,drive_folder_id")
    .not("document_id", "is", null)
    .is("draft_id", null)
    .or(`status.eq.PENDING,and(status.in.(RETRY,SYNCING),updated_at.lt.${cutoff})`)
    .order("updated_at").limit(2);
  if (error) throw error;

  let archived = 0;
  for (const row of rows ?? []) {
    const owner = new Date().toISOString();
    const attempts = row.attempt_count + 1;
    const { data: claimed, error: claimError } = await admin.from("tributary_drive_sync_items")
      .update({ status: "SYNCING", updated_at: owner, attempt_count: attempts })
      .eq("id", row.id).eq("status", row.status).eq("updated_at", row.updated_at)
      .select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const { data: doc, error: docError } = await admin.from("documents")
        .select("id,document_type,external_issue_date,external_tax_document_type,drive_file_id,project_id,customer_id,mime_type")
        .eq("id", row.document_id!).is("deleted_at", null).maybeSingle();
      if (docError) throw docError;
      if (!doc || doc.document_type !== "EXTERNAL_TAX_DOCUMENT" || !doc.external_issue_date
        || !doc.external_tax_document_type || !doc.drive_file_id || !doc.project_id || !doc.customer_id
        || doc.project_id !== row.project_id || doc.customer_id !== row.customer_id
        || row.artifact_kind !== "PDF" || doc.mime_type !== "application/pdf") {
        throw new Error("El respaldo externo no cumple los requisitos de archivo automático.");
      }

      const folder = await archive.resolveFolder(doc.external_issue_date, doc.external_tax_document_type, "PDF");
      if (row.drive_folder_id && row.drive_folder_id !== folder) throw new Error("El destino de Drive cambió durante el reintento.");
      const shortcutId = row.drive_file_id ?? await archive.reserveId();
      const { data: reserved, error: reserveError } = await admin.from("tributary_drive_sync_items")
        .update({ drive_file_id: shortcutId, drive_folder_id: folder })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner)
        .select("id").maybeSingle();
      if (reserveError) throw reserveError;
      if (!reserved) continue;

      await archive.archiveShortcut({ id: shortcutId, parentId: folder, targetId: doc.drive_file_id, name: `ORBIT-${doc.id}.pdf` });
      const { error: completionError } = await admin.from("tributary_drive_sync_items")
        .update({ status: "SYNCED", synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner);
      if (completionError) throw completionError;
      archived++;
    } catch {
      const { error: failure } = await admin.from("tributary_drive_sync_items")
        .update({ status: attempts >= MAX_ATTEMPTS ? "FAILED" : "RETRY", last_error: "No se pudo verificar el documento o archivarlo en FINANZAS SII.", updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner);
      if (failure) throw failure;
    }
  }
  return { selected: rows?.length ?? 0, archived };
}
