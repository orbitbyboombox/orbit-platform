import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken, loadLegacyOwnerDriveRepairToken } from "../../google-workspace/application/google-workspace.repository";

const SOURCE_LIMIT_BYTES = 8 * 1024 * 1024;
const SHA256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Row = {
  id: string; project_id: string; drive_file_id: string; checksum: string;
  storage_bucket: string; storage_path: string; drive_sync_status: string; metadata: Record<string, unknown> | null;
};
export type HistoricalIntegrityResult = { documentId: string; status: "SYNCED" | "REQUIRES_REVIEW"; reason?: string };

function fingerprint(bytes: Uint8Array) {
  return { sha256: SHA256(bytes), size: bytes.byteLength };
}

async function driveFileBytes(fileId: string, primaryToken: string): Promise<Uint8Array> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const get = (token: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  let response = await get(primaryToken);
  if (response.status === 403 || response.status === 404) {
    // Solo se acepta la autorización legada de la misma cuenta propietaria.
    const ownerToken = await loadLegacyOwnerDriveRepairToken("matias@boom-box.cl");
    response = await get(ownerToken);
  }
  if (!response.ok) throw new Error(`El archivo Drive no se puede descargar (HTTP ${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > SOURCE_LIMIT_BYTES) throw new Error("Archivo supera límite de verificación de 8 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > SOURCE_LIMIT_BYTES) throw new Error("Archivo supera límite de verificación de 8 MB.");
  return bytes;
}

/** Un documento por acción, sin sobreescribir archivos ni hashes de origen. */
export async function verifyHistoricalDocumentIntegrity(documentId: string): Promise<HistoricalIntegrityResult> {
  const client = createAdminClient();
  const { data: row, error } = await client.from("documents")
    .select("id,project_id,drive_file_id,checksum,storage_bucket,storage_path,drive_sync_status,metadata")
    .eq("id", documentId).eq("drive_sync_status", "PENDING").is("deleted_at", null)
    .single<Row>();
  if (error || !row || !row.drive_file_id || row.metadata?.drive_link_audit === undefined)
    return { documentId, status: "REQUIRES_REVIEW", reason: "Registro sin auditoría de enlace pendiente o ya procesado." };
  const link = row.metadata.drive_link_audit as Record<string, unknown>;
  if (link.result !== "LINK_VERIFIED")
    return { documentId, status: "REQUIRES_REVIEW", reason: "Enlace sin validación previa." };
  const { data: original, error: sourceError } = await client.storage.from(row.storage_bucket).download(row.storage_path);
  if (sourceError || !original) return { documentId, status: "REQUIRES_REVIEW", reason: "Original inaccesible en Supabase Storage." };
  const sourceBytes = new Uint8Array(await original.arrayBuffer());
  if (sourceBytes.byteLength > SOURCE_LIMIT_BYTES) return { documentId, status: "REQUIRES_REVIEW", reason: "Original supera límite de 8 MB." };
  const src = fingerprint(sourceBytes);
  let dst;
  try {
    const token = await loadGoogleWorkspaceAccessToken();
    dst = fingerprint(await driveFileBytes(row.drive_file_id, token));
  } catch (error) {
    return { documentId, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "Falló la lectura de Drive." };
  }
  if (src.sha256 !== dst.sha256 || src.size !== dst.size || src.sha256 !== row.checksum)
    return { documentId, status: "REQUIRES_REVIEW", reason: `Diferencia de integridad: original SHA-256 ${src.sha256.slice(0,12)}…, Drive ${dst.sha256.slice(0,12)}…, registro ${row.checksum.slice(0,12)}…; sin cambios.` };
  const now = new Date().toISOString();
  const meta = {
    ...(row.metadata ?? {}),
    drive_link_audit: {
      ...link, result: "CONTENT_VERIFIED", content_verified: true,
      verified_sha256: src.sha256, verified_size: src.size,
      verified_at: now, method: "BINARY_SHA256_STORAGE_DRIVE_DATABASE",
    },
  };
  const { data: updated, error: updateError } = await client.from("documents").update({
    drive_sync_status: "SYNCED", drive_sync_error: null,
    drive_synced_at: now, metadata: meta,
  }).eq("id", row.id).eq("drive_file_id", row.drive_file_id)
    .eq("drive_sync_status", "PENDING").eq("checksum", row.checksum).select("id").maybeSingle();
  if (updateError || !updated) return { documentId, status: "REQUIRES_REVIEW", reason: "Conflicto de actualización; no se modificó el documento." };
  return { documentId, status: "SYNCED" };
}
