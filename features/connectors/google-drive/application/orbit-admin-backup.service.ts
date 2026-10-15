import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGoogleWorkspaceAccessToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider, type GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";
import { decryptBackupArtifact, encryptBackupArtifact } from "./orbit-admin-backup.crypto";

export type AdminBackupScope = "STORAGE" | "DATABASE";
export type AdminBackupStatus = "SUCCEEDED" | "FAILED" | "BLOCKED";

export type AdminBackupResult = {
  scope: AdminBackupScope;
  status: AdminBackupStatus;
  runId?: string;
  driveFolderId?: string;
  manifestDriveFileId?: string;
  manifestSha256?: string;
  filesProcessed: number;
  reason?: string;
};

type StorageObject = {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  mimeType: string;
  size: number;
  sha256: string;
};

type StorageManifestObject = Omit<StorageObject, "bytes" | "mimeType"> & {
  mimeType: string;
  encryptedSize: number;
  encryptedSha256: string;
};

const MAX_PAGE_SIZE = 100;
const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));


function backupRootFolderId() {
  const value = (process.env.ORBIT_BACKUP_DRIVE_FOLDER_ID ?? process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID)?.trim();
  if (!value) throw new Error("BACKUP_DRIVE_FOLDER_NOT_CONFIGURED");
  return value;
}

export async function* iterateStorageObjects(client: SupabaseClient): AsyncGenerator<StorageObject> {
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw bucketError;
  for (const bucket of buckets ?? []) {
    const pending = [""];
    while (pending.length) {
      const prefix = pending.shift()!;
      let offset = 0;
      while (true) {
        const { data: entries, error } = await client.storage.from(bucket.name).list(prefix, { limit: MAX_PAGE_SIZE, offset });
        if (error) throw error;
        if (!entries?.length) break;
        for (const entry of entries) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id) {
            const { data, error: downloadError } = await client.storage.from(bucket.name).download(path);
            if (downloadError || !data) throw downloadError ?? new Error(`STORAGE_OBJECT_UNAVAILABLE:${bucket.name}/${path}`);
            const bytes = new Uint8Array(await data.arrayBuffer());
            yield {
              bucket: bucket.name,
              path,
              bytes,
              mimeType: typeof entry.metadata?.mimetype === "string" ? entry.metadata.mimetype : "application/octet-stream",
              size: bytes.byteLength,
              sha256: sha256(bytes),
            };
          } else {
            pending.push(path);
          }
        }
        if (entries.length < MAX_PAGE_SIZE) break;
        offset += entries.length;
      }
    }
  }
}

async function ensureFolder(provider: GoogleDriveLiveProvider, name: string, parentFolderId: string) {
  return (await provider.findFolder({ name, parentFolderId })) ?? provider.createFolder({ name, parentFolderId });
}

async function uploadIdempotent(provider: GoogleDriveLiveProvider, input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId: string; appProperties: Record<string, string>; plaintextSha256?: string }) {
  const existing = provider.findFilesByName
    ? await provider.findFilesByName({ name: input.name, parentFolderId: input.parentFolderId })
    : [];
  const inputMd5 = createHash("md5").update(input.bytes).digest("hex");
  const owned = existing.find((file) =>
    Object.entries(input.appProperties).every(([key, value]) => file.appProperties?.[key] === value)
    || (file.md5Checksum === inputMd5 && file.size === String(input.bytes.byteLength))
  );
  const file = owned ?? await provider.uploadFile(input);
  if (!provider.readFile) throw new Error("DRIVE_READBACK_UNAVAILABLE");
  const readback = await provider.readFile(file.id);
  if (sha256(readback) !== sha256(input.bytes)) {
    try {
      if (!input.plaintextSha256 || sha256(decryptBackupArtifact(readback)) !== input.plaintextSha256) throw new Error("mismatch");
    } catch {
      throw new Error(`DRIVE_CHECKSUM_MISMATCH:${input.name}`);
    }
  }
  return file;
}

async function claimRun(client: SupabaseClient, scope: AdminBackupScope, idempotencyKey: string, createdBy: string) {
  const { data, error } = await client.from("admin_backup_runs").insert({ scope, idempotency_key: idempotencyKey, status: "RUNNING", created_by: createdBy }).select("id,drive_folder_id,metadata").single<{ id: string; drive_folder_id?: string; metadata?: Record<string, unknown> }>();
  if (!error && data) return { claimed: true, id: data.id, driveFolderId: data.drive_folder_id, metadata: data.metadata ?? {} };
  const { data: existing } = await client.from("admin_backup_runs").select("id,status,drive_folder_id,metadata").eq("idempotency_key", idempotencyKey).maybeSingle<{ id: string; status: string; drive_folder_id?: string; metadata?: Record<string, unknown> }>();
  if (existing?.status === "SUCCEEDED") return { claimed: false, id: existing.id, driveFolderId: existing.drive_folder_id, metadata: existing.metadata ?? {} };
  if (existing?.status === "FAILED") {
    const { data: resumed, error: resumeError } = await client.from("admin_backup_runs").update({ status: "RUNNING", error_code: null, error_message: null, finished_at: null }).eq("id", existing.id).eq("status", "FAILED").select("id,drive_folder_id,metadata").maybeSingle<{ id: string; drive_folder_id?: string; metadata?: Record<string, unknown> }>();
    if (!resumeError && resumed) return { claimed: true, id: resumed.id, driveFolderId: resumed.drive_folder_id, metadata: resumed.metadata ?? {}, resumed: true };
  }
  throw new Error("BACKUP_ALREADY_RUNNING_OR_CLAIM_FAILED");
}

async function updateRunOrThrow(client: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  const { error } = await client.from("admin_backup_runs").update(patch).eq("id", runId);
  if (error) throw new Error("BACKUP_LEDGER_UPDATE_FAILED");
}

export async function runOrbitStorageBackup(input: { client: SupabaseClient; createdBy: string; idempotencyKey: string; provider?: GoogleDriveLiveProvider; now?: Date }): Promise<AdminBackupResult> {
  let runId: string | undefined;
  try {
    const claim = await claimRun(input.client, "STORAGE", input.idempotencyKey, input.createdBy);
    runId = claim.id;
    if (!claim.claimed) return { scope: "STORAGE", status: "SUCCEEDED", runId, filesProcessed: 0, reason: "IDEMPOTENT_REPLAY" };
    const provider = input.provider ?? new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
    const rootId = backupRootFolderId();
    const date = (input.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFolder = claim.driveFolderId
      ? { id: claim.driveFolderId, name: `ORBIT_BACKUP_${date}_${runId}` }
      : await provider.createFolder({ name: `ORBIT_BACKUP_${date}_${runId}`, parentFolderId: rootId });
    const manifestObjects: StorageManifestObject[] = [];
    const bucketFolders = new Map<string, string>();
    let filesProcessed = 0;
    for await (const object of iterateStorageObjects(input.client)) {
      const encrypted = encryptBackupArtifact(object.bytes);
      const encryptedSha256 = sha256(encrypted);
      const bucketFolderId = bucketFolders.get(object.bucket) ?? (await ensureFolder(provider, safeSegment(object.bucket), backupFolder.id)).id;
      bucketFolders.set(object.bucket, bucketFolderId);
      const name = `${safeSegment(object.bucket)}__${safeSegment(object.path)}`;
      await uploadIdempotent(provider, { name: `${name}.enc`, mimeType: "application/octet-stream", bytes: encrypted, parentFolderId: bucketFolderId, plaintextSha256: object.sha256, appProperties: { orbitBackupRunId: runId, orbitBackupKind: "STORAGE", sourceBucket: object.bucket, sourcePath: object.path, sha256: object.sha256 } });
      manifestObjects.push({ bucket: object.bucket, path: object.path, size: object.size, sha256: object.sha256, mimeType: object.mimeType, encryptedSize: encrypted.byteLength, encryptedSha256 });
      filesProcessed += 1;
      await updateRunOrThrow(input.client, runId, { drive_folder_id: backupFolder.id, metadata: { filesProcessed, lastBucket: object.bucket, lastPath: object.path } });
    }
    const manifest = { schema: "orbit-storage-backup-v2", runId, createdAt: new Date().toISOString(), source: "Supabase Storage", encryption: { algorithm: "AES-256-GCM", keyVersion: "orbit-admin-backup-v1", keyLocation: "server-environment-only" }, objects: manifestObjects };
    const manifestBytes = jsonBytes(manifest);
    const encryptedManifest = encryptBackupArtifact(manifestBytes);
    const manifestHash = sha256(manifestBytes);
    const manifestFile = await uploadIdempotent(provider, { name: "manifest.json.enc", mimeType: "application/octet-stream", bytes: encryptedManifest, parentFolderId: backupFolder.id, plaintextSha256: manifestHash, appProperties: { orbitBackupRunId: runId, orbitBackupKind: "STORAGE_MANIFEST", sha256: manifestHash } });
    await updateRunOrThrow(input.client, runId, { status: "SUCCEEDED", drive_folder_id: backupFolder.id, manifest_drive_file_id: manifestFile.id, manifest_sha256: manifestHash, metadata: { files: manifestObjects.length }, finished_at: new Date().toISOString() });
    return { scope: "STORAGE", status: "SUCCEEDED", runId, driveFolderId: backupFolder.id, manifestDriveFileId: manifestFile.id, manifestSha256: manifestHash, filesProcessed: manifestObjects.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "BACKUP_FAILED";
    if (runId) await input.client.from("admin_backup_runs").update({ status: "FAILED", error_code: reason.split(":")[0], error_message: reason.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
    return { scope: "STORAGE", status: "FAILED", runId, filesProcessed: 0, reason };
  }
}

export async function runOrbitDatabaseBackup(): Promise<AdminBackupResult> {
  return { scope: "DATABASE", status: "BLOCKED", filesProcessed: 0, reason: "DATABASE_EXPORT_REQUIRES_PROTECTED_CI_PG_DUMP_AND_SUPABASE_DB_URL" };
}
