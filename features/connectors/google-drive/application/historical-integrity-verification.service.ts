import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken, loadLegacyOwnerDriveRepairToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";

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
  if (src.sha256 !== dst.sha256 || src.size !== dst.size)
    return { documentId, status: "REQUIRES_REVIEW",
      reason: `Las copias son diferentes: Storage SHA-256 ${src.sha256.slice(0,12)}…, Drive SHA-256 ${dst.sha256.slice(0,12)}…. No se modifica el documento.` };
  // Algunos registros históricos contienen OPERATIONAL-FINGERPRINT:v1 (huella de
  // migración), no un SHA-256. Conservar el valor histórico y registrar por
  // separado el digest criptográfico real de dos copias binarias idénticas.
  const historicalChecksumMatches = src.sha256 === row.checksum;
  const historicalChecksumType = row.checksum.startsWith("OPERATIONAL-FINGERPRINT:v1|")
    ? "OPERATIONAL_FINGERPRINT_V1" : /^[a-f0-9]{64}$/i.test(row.checksum)
      ? "SHA256_HISTORICO" : "OTHER_HISTORICAL_VALUE";
  const now = new Date().toISOString();
  const meta = {
    ...(row.metadata ?? {}),
    drive_link_audit: {
      ...link, result: "CONTENT_VERIFIED", content_verified: true,
      verified_sha256: src.sha256, verified_size: src.size,
      verified_at: now, method: "BINARY_SHA256_STORAGE_EQUALS_DRIVE",
      historical_checksum: row.checksum,
      historical_checksum_type: historicalChecksumType,
      historical_checksum_matches_bytes: historicalChecksumMatches,
      historical_checksum_preserved: true,
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


const ARCHIVE_ID = "10t9rNuR2fJOUMKcTrW6pUPbYuLqxbUlz";
const DRIVE_ROOT_ID = "1EFHCbHnYYXGlHY4CF0ZUWmInVRnmcfcM";
const LEGACY_DOCUMENT_ID = "8bc80c7b-e54e-40c7-a2f9-b31bfa8c211f";
const OLD_DRIVE_FILE_ID = "1swH2XGbN0ELPMNGNmNJMYyyAsI7V1Nnu";

/**
 * Una sola restauración histórica: guardar el original intacto en el archivo
 * de conciliación ya existente, nunca duplicar árbol de reservas canceladas.
 */
export async function restoreHistoricalMissingDriveDocument() {
  const client = createAdminClient();
  const { data: document, error } = await client.from("documents")
    .select("id,project_id,document_type,storage_bucket,storage_path,checksum,drive_file_id,drive_sync_status,metadata")
    .eq("id", LEGACY_DOCUMENT_ID).eq("drive_sync_status", "ERROR").is("deleted_at", null)
    .single<{
      id: string; project_id: string; document_type: string; storage_bucket: string; storage_path: string;
      checksum: string; drive_file_id: string; drive_sync_status: string; metadata: Record<string, unknown> | null;
    }>();
  if (error || !document || document.drive_file_id !== OLD_DRIVE_FILE_ID
    || document.document_type !== "COMMERCIAL_DOCUMENT" || document.storage_bucket !== "orbit-documents"
    || document.storage_path !== "3e7372d0-1f31-4c46-b711-3a080f81124e/b231384d-960f-4fda-a708-98a1a6fc3fef/documento-con-factura.pdf"
    || document.checksum !== "398b80c5a367f4882dc84b984649ffc015ccad0dddc62dced5ab47e95b0ec4e9")
    throw new Error("El registro histórico cambió; se detuvo la recuperación.");

  const { data: source, error: sourceError } = await client.storage.from(document.storage_bucket).download(document.storage_path);
  if (sourceError || !source) throw new Error("El archivo histórico no está disponible en Supabase.");
  const bytes = new Uint8Array(await source.arrayBuffer());
  const sha = SHA256(bytes);
  if (sha !== document.checksum) throw new Error("Checksum SHA-256 del original no coincide: sin cambios ni nuevo upload.");
  if (bytes.byteLength > SOURCE_LIMIT_BYTES || bytes.byteLength < 5
    || [37,80,68,70,45].some((value, i) => bytes[i] !== value))
    throw new Error("El archivo original no es un PDF válido para esta recuperación.");

  let token = await loadGoogleWorkspaceAccessToken();
  let provider = new GoogleDriveApiProvider(token);
  try {
    const parents = await provider.getFolderParents(ARCHIVE_ID);
    if (parents.length !== 1 || parents[0] !== DRIVE_ROOT_ID)
      throw new Error("La carpeta de conciliación ya no está bajo la raíz BOOMBOX ORBIT.");
  } catch (error) {
    if (!/404|403|not found/i.test(String(error))) throw error;
    token = await loadLegacyOwnerDriveRepairToken("matias@boom-box.cl");
    provider = new GoogleDriveApiProvider(token);
    const parents = await provider.getFolderParents(ARCHIVE_ID);
    if (parents.length !== 1 || parents[0] !== DRIVE_ROOT_ID)
      throw new Error("La carpeta de conciliación no corresponde a la raíz BOOMBOX ORBIT.");
  }

  const filename = `ORBIT_${LEGACY_DOCUMENT_ID}_2016-10-17_Abigail-Vega_documento-con-factura.pdf`;
  const candidates = await provider.findFilesByName({ name: filename, parentFolderId: ARCHIVE_ID });
  if (candidates.some((file) => !file.md5Checksum
    || file.md5Checksum.toLowerCase() !== createHash("md5").update(bytes).digest("hex")
    || Number(file.size) !== bytes.byteLength))
    throw new Error("Hay un archivo con el mismo nombre y contenido distinto en el archivo histórico.");
  if (candidates.length > 1) throw new Error("Archivo histórico duplicado en Drive; revisión manual requerida.");
  const fileId = candidates[0]?.id ?? (await provider.uploadFile({
    name: filename, mimeType: "application/pdf", bytes,
    parentFolderId: ARCHIVE_ID,
    appProperties: { orbitDocumentId: document.id, orbitStorageChecksum: sha, orbitOriginalDriveId: OLD_DRIVE_FILE_ID },
  })).id;

  const archiveBytes = await driveFileBytes(fileId, token);
  if (SHA256(archiveBytes) !== sha || archiveBytes.byteLength !== bytes.byteLength)
    throw new Error("El archivo subido a Drive no superó la comprobación SHA-256; no se cambió el enlace.");

  const now = new Date().toISOString();
  const metadata = {
    ...(document.metadata ?? {}),
    drive_link_audit: {
      previous_drive_file_id: OLD_DRIVE_FILE_ID,
      result: "CONTENT_VERIFIED",
      method: "ARCHIVE_RESTORE_SHA256_STORAGE_DRIVE",
      content_verified: true, verified_sha256: sha,
      verified_size: bytes.byteLength,
      archive_folder_id: ARCHIVE_ID, verified_at: now,
    },
  };
  const { data: updated, error: updateError } = await client.from("documents").update({
    drive_file_id: fileId, drive_folder_id: ARCHIVE_ID, drive_sync_status: "SYNCED",
    drive_synced_at: now, drive_sync_error: null, metadata,
  }).eq("id", document.id).eq("drive_file_id", OLD_DRIVE_FILE_ID)
    .eq("drive_sync_status", "ERROR").eq("checksum", document.checksum).select("id").maybeSingle();
  if (updateError || !updated) throw new Error("Se validó el archivo, pero el registro cambió; no se modificó el vínculo.");
  return { documentId: document.id, status: "SYNCED" as const, driveFileId: fileId };
}
