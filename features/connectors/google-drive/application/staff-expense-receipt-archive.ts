import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withDriveReconciliationLease } from "./drive-reconciliation-lease";
import { archiveVerifiedDriveFile } from "./google-drive-document-routing.service";
import { BOOMBOX_ORBIT_ROOT_ID, loadReservationDriveProvider } from "./reservation-drive-provider";

const STAFF_CATEGORY = "1wRsOwrA1eWUoZf3XAbkiLyOwruf6baLx";
const STAFF_ARCHIVE = "1nFkPucHqIrMW6b3rz8FxJ-W78ZyYE6Rc";
const OPERATORS = "1zGcNBU50KXYedhWfOXNXvod1wyF8YZRR";

export async function archivePendingStaffExpenses(client: SupabaseClient, month: string) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Período de Staff inválido.");
  const next = new Date(`${month}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return withDriveReconciliationLease("private-staff-expense-receipts", async () => {
    const { data: submissions, error } = await client.from("staff_expense_submissions")
      .select("id,staff_id,project_id,document_id,receipt_path,staff(first_name,last_name)")
      .eq("status", "APPROVED").not("document_id", "is", null).not("receipt_path", "is", null)
      .gte("occurred_on", `${month}-01`).lt("occurred_on", next.toISOString().slice(0, 10));
    if (error) throw error;
    const sources = new Map((submissions ?? []).map(row => [row.document_id, row]));
    const ids = [...sources.keys()].filter((id): id is string => Boolean(id));
    const results: Array<{ kind: "EXPENSE"; sourceId: string; status: "SYNCED" | "REQUIRES_REVIEW"; driveFileId?: string; reason?: string }> = [];
    if (!ids.length) return { processed: 0, synced: 0, requiresReview: 0, results };
    const { data: documents, error: documentError } = await client.from("documents")
      .select("id,project_id,storage_bucket,storage_path,original_filename,mime_type,checksum")
      .in("id", ids).eq("document_type", "STAFF_EXPENSE_RECEIPT")
      .is("deleted_at", null).is("drive_file_id", null);
    if (documentError) throw documentError;
    if (!documents?.length) return { processed: 0, synced: 0, requiresReview: 0, results };

    const { provider } = await loadReservationDriveProvider({ folderIds: [STAFF_CATEGORY, STAFF_ARCHIVE, OPERATORS], discover: true });
    const privateFolder = async (id: string, parent: string, name: string) => {
      const found = await provider.readPrivateFolder(id);
      if (found.parents.length !== 1 || found.parents[0] !== parent || found.name !== name) {
        throw new Error("El destino privado de Staff no coincide con su ubicación esperada.");
      }
      return found.id;
    };
    await Promise.all([
      privateFolder(STAFF_CATEGORY, BOOMBOX_ORBIT_ROOT_ID, "02_STAFF"),
      privateFolder(STAFF_ARCHIVE, STAFF_CATEGORY, "ARCHIVO_DOCUMENTAL"),
      privateFolder(OPERATORS, STAFF_ARCHIVE, "OPERADORES"),
    ]);
    const [year] = month.split("-");
    const destinationByStaff = new Map<string, string>();
    for (const document of documents) {
      const source = sources.get(document.id);
      if (!source) continue;
      try {
        if (!document.checksum || !document.storage_path || document.project_id !== source.project_id ||
            document.storage_path !== source.receipt_path) throw new Error("El comprobante no coincide con su rendición aprobada.");
        const rawStaff = Array.isArray(source.staff) ? source.staff[0] : source.staff;
        if (!rawStaff || !source.staff_id) throw new Error("El comprobante no tiene operador vinculado.");
        let destination = destinationByStaff.get(source.staff_id);
        if (!destination) {
          const staffName = `${rawStaff.first_name} ${rawStaff.last_name}`.trim().replace(/[\\/]+/g, "-");
          const folderName = `${source.staff_id} — ${staffName}`;
          const staffFolder = await provider.findFolder({ name: folderName, parentFolderId: OPERATORS });
          if (!staffFolder) throw new Error("No hay una carpeta privada inequívoca para el operador.");
          destination = await privateFolder(staffFolder.id, OPERATORS, folderName);
          for (const name of ["06_GASTOS_REEMBOLSOS", year, month]) {
            const parent = destination;
            const leaf = await provider.findFolder({ name, parentFolderId: parent }) ?? await provider.createFolder({ name, parentFolderId: parent });
            destination = await privateFolder(leaf.id, parent, name);
          }
          destinationByStaff.set(source.staff_id, destination);
        }
        const stored = await client.storage.from(document.storage_bucket || "orbit-documents").download(document.storage_path);
        if (stored.error || !stored.data) throw new Error("El original no está disponible en Storage.");
        const bytes = new Uint8Array(await stored.data.arrayBuffer());
        if (createHash("sha256").update(bytes).digest("hex") !== document.checksum) throw new Error("La huella del original no coincide.");
        const base = (document.original_filename || document.storage_path.split("/").at(-1) || "comprobante").replace(/[\\/\x00-\x1f]+/g, "-");
        const file = await archiveVerifiedDriveFile({
          provider, folderId: destination, name: `${document.id} - ${base}`,
          mimeType: document.mime_type || stored.data.type || "application/octet-stream", bytes,
        });
        const { data: linked, error: linkError } = await client.from("documents").update({
          drive_file_id: file.id, drive_folder_id: destination, drive_sync_status: "SYNCED",
          drive_sync_error: null, drive_synced_at: new Date().toISOString(),
        }).eq("id", document.id).eq("checksum", document.checksum).eq("storage_path", document.storage_path)
          .is("deleted_at", null).is("drive_file_id", null).select("id").maybeSingle();
        if (linkError || !linked) throw new Error("El documento cambió durante la sincronización.");
        results.push({ kind: "EXPENSE", sourceId: source.id, status: "SYNCED", driveFileId: file.id });
      } catch (error) {
        results.push({ kind: "EXPENSE", sourceId: source.id, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "No se pudo respaldar el original." });
      }
    }
    const synced = results.filter(item => item.status === "SYNCED").length;
    return { processed: results.length, synced, requiresReview: results.length - synced, results };
  });
}
