import "server-only";

import { createHash } from "node:crypto";

import { loadLegacyOwnerDriveRepairToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRefreshingDriveTransport, createTributaryDriveArchive } from "./tributary-drive-archive";

const loadArchiveToken = () => loadLegacyOwnerDriveRepairToken("matias@boom-box.cl");
const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;

export async function processTributaryDriveQueue() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const { data: rows, error } = await admin.from("tributary_drive_sync_items")
    .select("id,document_id,project_id,customer_id,artifact_kind,idempotency_key,attempt_count,status,updated_at,drive_file_id,drive_folder_id,checksum")
    .is("draft_id", null)
    .or(`and(or(idempotency_key.like.document:%:central:PDF,idempotency_key.like.rcv-import:%:CSV),or(status.eq.PENDING,and(status.in.(RETRY,SYNCING),updated_at.lt.${cutoff})))`)
    .order("updated_at").limit(8);
  if (error) throw error;
  if (!rows?.length) return { selected: 0, archived: 0 };

  const token = await loadArchiveToken();
  const archive = createTributaryDriveArchive(token, createRefreshingDriveTransport(token, loadArchiveToken));
  let archived = 0;
  for (const row of rows ?? []) {
    const owner = new Date().toISOString();
    // An interrupted final attempt must not start an unbounded new upload.
    // Preserve its reserved Drive ID for administrative recovery.
    if (row.attempt_count >= MAX_ATTEMPTS) {
      const { error: exhaustedError } = await admin.from("tributary_drive_sync_items")
        .update({ status: "FAILED", last_error: "Límite de intentos alcanzado; verificar el ID reservado antes de reintentar.", updated_at: owner })
        .eq("id", row.id).eq("status", row.status).eq("updated_at", row.updated_at);
      if (exhaustedError) throw exhaustedError;
      continue;
    }
    const attempts = row.attempt_count + 1;
    const { data: claimed, error: claimError } = await admin.from("tributary_drive_sync_items")
      .update({ status: "SYNCING", updated_at: owner, attempt_count: attempts })
      .eq("id", row.id).eq("status", row.status).eq("updated_at", row.updated_at)
      .select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const csv = row.artifact_kind === "CSV";
      let folder: string;
      let sync: (id: string) => Promise<string>;
      if (csv) {
        const id = /^rcv-import:([0-9a-f-]{36}):CSV$/.exec(row.idempotency_key)?.[1];
        if (!id) throw new Error("Referencia de importación inválida.");
        const { data, error } = await admin.from("sii_rcv_imports" as never)
          .select("register,period,source_name,source_bytes,source_hash")
          .eq("id", id).eq("company_rut", "765652723").maybeSingle();
        if (error) throw error;
        const original = data as { register: string; period: string; source_name: string; source_bytes: string; source_hash: string } | null;
        if (!original || !["Compras", "Ventas"].includes(original.register)
          || !/^RCV_[a-z0-9_.-]+\.csv$/i.test(original.source_name)
          || !/^\\x(?:[0-9a-f]{2})+$/i.test(original.source_bytes)) throw new Error("Origen CSV no verificable.");
        const bytes = Buffer.from(original.source_bytes.slice(2), "hex");
        const checksum = createHash("sha256").update(bytes).digest("hex");
        if (checksum !== original.source_hash || checksum !== row.checksum) throw new Error("El original CSV no coincide con su huella de importación.");
        folder = await archive.resolveFolder(original.period, original.register, "CSV");
        sync = id => archive.archiveCsv({ id, parentId: folder, name: original.source_name, bytes, checksum });
      } else {
        if (!row.document_id || row.artifact_kind !== "PDF" || row.idempotency_key !== `document:${row.document_id}:central:PDF`) throw new Error("Referencia documental inválida.");
        const { data: doc, error: docError } = await admin.from("documents")
          .select("id,document_type,external_issue_date,external_tax_document_type,drive_file_id,project_id,customer_id,mime_type,checksum")
          .eq("id", row.document_id).is("deleted_at", null).maybeSingle();
        if (docError) throw docError;
        if (!doc || doc.document_type !== "EXTERNAL_TAX_DOCUMENT" || !doc.external_issue_date
          || !doc.external_tax_document_type || !doc.drive_file_id || !doc.project_id || !doc.customer_id
          || (row.checksum != null && doc.checksum !== row.checksum)
          || doc.project_id !== row.project_id || doc.customer_id !== row.customer_id || doc.mime_type !== "application/pdf") {
          throw new Error("El respaldo externo no cumple los requisitos de archivo automático.");
        }
        const expectedChecksum = doc.checksum;
        if (!expectedChecksum || !/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
          throw new Error("El PDF original no tiene una huella SHA-256 verificable.");
        }
        const targetId = doc.drive_file_id;
        folder = await archive.resolveFolder(doc.external_issue_date, doc.external_tax_document_type, "PDF");
        sync = id => archive.archiveShortcut({ id, parentId: folder, targetId, name: `ORBIT-${doc.id}.pdf`, expectedChecksum });
      }
      if (row.drive_folder_id && row.drive_folder_id !== folder) throw new Error("El destino de Drive cambió durante el reintento.");
      const driveId = row.drive_file_id ?? await archive.reserveId(csv ? "files" : "shortcuts");
      const { data: reserved, error: reserveError } = await admin.from("tributary_drive_sync_items")
        .update({ drive_file_id: driveId, drive_folder_id: folder })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner)
        .select("id").maybeSingle();
      if (reserveError) throw reserveError;
      if (!reserved) continue;

      await sync(driveId);
      const { data: completed, error: completionError } = await admin.from("tributary_drive_sync_items")
        .update({ status: "SYNCED", synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner)
        .select("id").maybeSingle();
      if (completionError) throw completionError;
      if (completed) archived++;
    } catch {
      const { error: failure } = await admin.from("tributary_drive_sync_items")
        .update({ status: attempts >= MAX_ATTEMPTS ? "FAILED" : "RETRY", last_error: "No se pudo verificar el documento o archivarlo en FINANZAS SII.", updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "SYNCING").eq("updated_at", owner);
      if (failure) throw failure;
    }
  }
  return { selected: rows?.length ?? 0, archived };
}
