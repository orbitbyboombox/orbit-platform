import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGoogleWorkspaceAccessToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider, type GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";

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

const MAX_PAGE_SIZE = 100;
const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));

function backupRootFolderId() {
  const value = (process.env.ORBIT_BACKUP_DRIVE_FOLDER_ID ?? process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID)?.trim();
  if (!value) throw new Error("BACKUP_DRIVE_FOLDER_NOT_CONFIGURED");
  return value;
}

async function listStorageObjects(client: SupabaseClient): Promise<StorageObject[]> {
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw bucketError;
  const output: StorageObject[] = [];
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
            output.push({
              bucket: bucket.name,
              path,
              bytes,
              mimeType: typeof entry.metadata?.mimetype === "string" ? entry.metadata.mimetype : "application/octet-stream",
              size: bytes.byteLength,
              sha256: sha256(bytes),
            });
          } else {
            pending.push(path);
          }
        }
        if (entries.length < MAX_PAGE_SIZE) break;
        offset += entries.length;
      }
    }
  }
  return output;
}

async function ensureFolder(provider: GoogleDriveLiveProvider, name: string, parentFolderId: string) {
  return (await provider.findFolder({ name, parentFolderId })) ?? provider.createFolder({ name, parentFolderId });
}

async function uploadIdempotent(provider: GoogleDriveLiveProvider, input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId: string; appProperties: Record<string, string> }) {
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
  if (sha256(readback) !== sha256(input.bytes)) throw new Error(`DRIVE_CHECKSUM_MISMATCH:${input.name}`);
  return file;
}

async function claimRun(client: SupabaseClient, scope: AdminBackupScope, idempotencyKey: string, createdBy: string) {
  const { data, error } = await client.from("admin_backup_runs").insert({ scope, idempotency_key: idempotencyKey, status: "RUNNING", created_by: createdBy }).select("id").single<{ id: string }>();
  if (!error && data) return { claimed: true, id: data.id };
  const { data: existing } = await client.from("admin_backup_runs").select("id,status").eq("idempotency_key", idempotencyKey).maybeSingle<{ id: string; status: string }>();
  if (existing?.status === "SUCCEEDED") return { claimed: false, id: existing.id };
  throw new Error("BACKUP_ALREADY_RUNNING_OR_CLAIM_FAILED");
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
    const backupFolder = await provider.createFolder({ name: `ORBIT_BACKUP_${date}_${runId}`, parentFolderId: rootId });
    const objects = await listStorageObjects(input.client);
    const manifest = { schema: "orbit-storage-backup-v1", runId, createdAt: new Date().toISOString(), source: "Supabase Storage", objects: objects.map((object) => ({ bucket: object.bucket, path: object.path, size: object.size, sha256: object.sha256 })) };
    for (const object of objects) {
      const bucketFolder = await ensureFolder(provider, safeSegment(object.bucket), backupFolder.id);
      const name = `${safeSegment(object.bucket)}__${safeSegment(object.path)}`;
      await uploadIdempotent(provider, { name, mimeType: object.mimeType, bytes: object.bytes, parentFolderId: bucketFolder.id, appProperties: { orbitBackupRunId: runId, orbitBackupKind: "STORAGE", sourceBucket: object.bucket, sourcePath: object.path, sha256: object.sha256 } });
    }
    const manifestBytes = jsonBytes(manifest);
    const manifestFile = await uploadIdempotent(provider, { name: "manifest.json", mimeType: "application/json", bytes: manifestBytes, parentFolderId: backupFolder.id, appProperties: { orbitBackupRunId: runId, orbitBackupKind: "STORAGE_MANIFEST", sha256: sha256(manifestBytes) } });
    const manifestHash = sha256(manifestBytes);
    await input.client.from("admin_backup_runs").update({ status: "SUCCEEDED", drive_folder_id: backupFolder.id, manifest_drive_file_id: manifestFile.id, manifest_sha256: manifestHash, metadata: { files: objects.length }, finished_at: new Date().toISOString() }).eq("id", runId);
    return { scope: "STORAGE", status: "SUCCEEDED", runId, driveFolderId: backupFolder.id, manifestDriveFileId: manifestFile.id, manifestSha256: manifestHash, filesProcessed: objects.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "BACKUP_FAILED";
    if (runId) await input.client.from("admin_backup_runs").update({ status: "FAILED", error_code: reason.split(":")[0], error_message: reason.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
    return { scope: "STORAGE", status: "FAILED", runId, filesProcessed: 0, reason };
  }
}

export async function runOrbitDatabaseBackup(): Promise<AdminBackupResult> {
  return { scope: "DATABASE", status: "BLOCKED", filesProcessed: 0, reason: "DATABASE_EXPORT_REQUIRES_PROTECTED_CI_PG_DUMP_AND_SUPABASE_DB_URL" };
}
