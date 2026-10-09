import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { buildCustomerFolderPlan } from "../application/google-drive-folder-strategy";
import { loadGoogleWorkspaceAccessToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider, type GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";

type RepairStatus = "SYNCED" | "REQUIRES_REVIEW" | "ERROR";
export type DocumentBackupRepairResult = {
  documentId: string;
  projectId: string;
  status: RepairStatus;
  driveFileId?: string;
  driveFolderId?: string;
  reason?: string;
};

type RepairDocument = {
  id: string;
  project_id: string;
  document_type: string;
  storage_bucket: string;
  storage_path: string;
  checksum: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  drive_file_id: string | null;
  project: { name: string | null; event_date: string | null; canonical_folder_id: string | null; orbit_event_id: string | null } | null;
};

const DOCUMENT_FOLDER: Record<string, string> = {
  COMMERCIAL_DOCUMENT: "03_Cotizaciones",
  PAYMENT_RECEIPT: "02_Comprobantes",
  STAFF_EXPENSE_RECEIPT: "02_Comprobantes",
};

const baseName = (path: string) => path.split("/").at(-1) || "documento";
const cleanName = (value: string) => value.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, " ");
const mimeFromName = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

function asProject(value: unknown): { name: string | null; event_date: string | null; canonical_folder_id: string | null; orbit_event_id: string | null } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const project = row as Record<string, unknown>;
  const operations = project.operations && typeof project.operations === "object" ? project.operations as Record<string, unknown> : null;
  const googleDrive = operations?.googleDrive && typeof operations.googleDrive === "object" ? operations.googleDrive as Record<string, unknown> : null;
  return {
    name: typeof project.name === "string" ? project.name : null,
    event_date: typeof project.event_date === "string" ? project.event_date : null,
    canonical_folder_id: typeof googleDrive?.folderId === "string" ? googleDrive.folderId : null,
    orbit_event_id: typeof project.orbit_event_id === "string" ? project.orbit_event_id : null,
  };
}

async function loadPendingDocuments(client: SupabaseClient, documentIds?: readonly string[]): Promise<RepairDocument[]> {
  let query = client.from("documents").select("id,project_id,document_type,storage_bucket,storage_path,checksum,original_filename,mime_type,file_size,drive_file_id,projects(name,event_date,operations,orbit_event_id)").is("drive_file_id", null).is("deleted_at", null);
  if (documentIds?.length) query = query.in("id", [...new Set(documentIds)]);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, project: asProject((row as Record<string, unknown>).projects) })) as unknown as RepairDocument[];
}

async function loadCanonicalFolderId(client: SupabaseClient, provider: GoogleDriveLiveProvider, document: RepairDocument, rootName: string): Promise<string> {
  const project = document.project;
  if (!project?.name || !project.event_date) throw new Error("Proyecto sin nombre o fecha canónica.");
  const subfolder = DOCUMENT_FOLDER[document.document_type];
  if (!subfolder) throw new Error(`Tipo documental sin carpeta canónica: ${document.document_type}`);
  const plan = buildCustomerFolderPlan(project.name, project.event_date, rootName, project.orbit_event_id ?? undefined);
  if (!project.canonical_folder_id) {
    throw new Error("Proyecto sin folderId canónico explícito; revisión administrativa requerida.");
  }
  const expectedEventPath = plan[2].path;
  const expectedDocumentPath = `${expectedEventPath}/${subfolder}`;
  const { data: eventRows, error: eventError } = await client.from("drive_sync").select("destination_key,external_folder_id,status").eq("project_id", document.project_id).eq("destination_key", expectedEventPath).not("external_folder_id", "is", null).limit(2);
  if (eventError) throw eventError;
  if (!eventRows?.length) throw new Error(`No existe mapeo Drive canónico para ${expectedEventPath}.`);
  if (eventRows.length !== 1) throw new Error(`Mapeo Drive ambiguo para ${expectedEventPath}.`);
  const eventFolderId = String(eventRows[0].external_folder_id);
  if (eventFolderId !== project.canonical_folder_id) {
    throw new Error(`Mapping Drive cruzado: el proyecto ${project.orbit_event_id ?? document.project_id} declara ${project.canonical_folder_id}, pero drive_sync apunta a ${eventFolderId}.`);
  }
  const { data: documentRows, error: documentError } = await client.from("drive_sync").select("destination_key,external_folder_id,status").eq("project_id", document.project_id).eq("destination_key", expectedDocumentPath).not("external_folder_id", "is", null).limit(2);
  if (documentError) throw documentError;
  if (!documentRows?.length) throw new Error(`No existe mapeo Drive canónico para ${expectedDocumentPath}.`);
  if (documentRows.length !== 1) throw new Error(`Mapeo Drive ambiguo para ${expectedDocumentPath}.`);
  const folderId = String(documentRows[0].external_folder_id);
  if (!folderId || folderId === project.canonical_folder_id) throw new Error(`Mapeo Drive inválido para ${expectedDocumentPath}.`);
  const parents = await provider.getFolderParents?.(folderId);
  if (parents && parents.length === 0) throw new Error("La carpeta Drive canónica no es accesible.");
  return folderId;
}

async function downloadAndVerify(client: SupabaseClient, document: RepairDocument): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  if (!document.checksum) throw new Error("Documento sin checksum SHA-256.");
  const { data, error } = await client.storage.from(document.storage_bucket).download(document.storage_path);
  if (error || !data) throw error ?? new Error("Archivo original no disponible en Supabase Storage.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== document.checksum) throw new Error("Checksum SHA-256 no coincide con el registro documental.");
  if (document.file_size !== null && Number(document.file_size) !== bytes.byteLength) throw new Error("Tamaño del archivo no coincide con el registro documental.");
  const filename = cleanName(document.original_filename || baseName(document.storage_path));
  const mimeType = document.mime_type || mimeFromName(filename);
  if (mimeType === "application/octet-stream") throw new Error("Tipo MIME no verificable.");
  return { bytes, mimeType, filename };
}

function md5(bytes: Uint8Array) {
  // Google Drive v3 exposes md5Checksum as lowercase hexadecimal.
  return createHash("md5").update(bytes).digest("hex");
}

async function findExactFile(provider: GoogleDriveLiveProvider, folderId: string, filenames: readonly string[], bytes: Uint8Array, documentId: string) {
  const files = (await Promise.all(filenames.map((name) => provider.findFilesByName
    ? provider.findFilesByName({ name, parentFolderId: folderId })
    : provider.findFileByName({ name, parentFolderId: folderId }).then((file) => file ? [file] : [])))).flat();
  const checksum = md5(bytes);
  return files
    .filter((file, index, all) => all.findIndex((candidate) => candidate.id === file.id) === index)
    .filter((file) => file.appProperties?.orbitDocumentId === documentId || (file.md5Checksum?.toLowerCase() === checksum && Number(file.size) === bytes.byteLength))
    .sort((left, right) => {
      const leftOwned = left.appProperties?.orbitDocumentId === documentId ? 0 : 1;
      const rightOwned = right.appProperties?.orbitDocumentId === documentId ? 0 : 1;
      return leftOwned - rightOwned || left.id.localeCompare(right.id);
    })[0] ?? null;
}

async function reconcileAfterUpload(provider: GoogleDriveLiveProvider, folderId: string, filenames: readonly string[], bytes: Uint8Array, documentId: string, uploadedId: string) {
  const canonical = await findExactFile(provider, folderId, filenames, bytes, documentId);
  if (!canonical) throw new Error("El archivo subido no pudo verificarse en Drive.");
  if (provider.deleteFile && canonical.id !== uploadedId) {
    const candidates = (await Promise.all(filenames.map((name) => provider.findFilesByName?.({ name, parentFolderId: folderId }) ?? Promise.resolve([])))).flat();
    for (const candidate of candidates) {
      if (candidate.id !== canonical.id && candidate.appProperties?.orbitDocumentId === documentId) await provider.deleteFile(candidate.id);
    }
  }
  return canonical;
}

async function syncOne(client: SupabaseClient, provider: GoogleDriveLiveProvider, rootName: string, document: RepairDocument): Promise<DocumentBackupRepairResult> {
  try {
    const folderId = await loadCanonicalFolderId(client, provider, document, rootName);
    const source = await downloadAndVerify(client, document);
    const deterministicName = `ORBIT_${document.id}_${source.filename}`;
    const exact = await findExactFile(provider, folderId, [source.filename, deterministicName], source.bytes, document.id);
    const file = exact ?? await provider.uploadFile({
      name: deterministicName,
      mimeType: source.mimeType,
      bytes: source.bytes,
      parentFolderId: folderId,
      appProperties: { orbitDocumentId: document.id, orbitStorageChecksum: document.checksum! },
    });
    const verifiedFile = exact ?? await reconcileAfterUpload(provider, folderId, [source.filename, deterministicName], source.bytes, document.id, file.id);
    const { data: updated, error } = await client.from("documents").update({ drive_file_id: verifiedFile.id, drive_folder_id: folderId, drive_sync_status: "SYNCED", drive_sync_error: null, drive_synced_at: new Date().toISOString() }).eq("id", document.id).is("drive_file_id", null).select("id").maybeSingle();
    if (error) throw error;
    if (!updated && !document.drive_file_id) {
      const { data: current } = await client.from("documents").select("drive_file_id,drive_folder_id").eq("id", document.id).maybeSingle();
      if (!current?.drive_file_id) throw new Error("Documento cambió durante la sincronización; no se sobrescribió.");
      return { documentId: document.id, projectId: document.project_id, status: "SYNCED", driveFileId: current.drive_file_id, driveFolderId: current.drive_folder_id ?? folderId };
    }
    return { documentId: document.id, projectId: document.project_id, status: "SYNCED", driveFileId: verifiedFile.id, driveFolderId: folderId };
  } catch (error) {
    return { documentId: document.id, projectId: document.project_id, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "No fue posible sincronizar el documento." };
  }
}

export async function repairPendingDocumentBackups(input: { client: SupabaseClient; documentIds?: readonly string[]; provider?: GoogleDriveLiveProvider; rootName?: string; dryRun?: boolean }): Promise<DocumentBackupRepairResult[]> {
  const [documents, company] = await Promise.all([loadPendingDocuments(input.client, input.documentIds), input.rootName ? Promise.resolve(null) : loadCompanySettings(input.client)]);
  const provider = input.provider ?? new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
  const rootName = input.rootName ?? company?.driveRootFolder ?? "BOOMBOX ORBIT";
  if (input.dryRun) {
    return documents.map((document) => ({ documentId: document.id, projectId: document.project_id, status: "REQUIRES_REVIEW", reason: "Dry-run: no se modificó Drive ni la base de datos." }));
  }
  return Promise.all(documents.map((document) => syncOne(input.client, provider, rootName, document)));
}
