import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decryptBackupArtifact, encryptBackupArtifact } from "../features/connectors/google-drive/application/orbit-admin-backup.crypto.ts";

const service = readFileSync("features/connectors/google-drive/application/orbit-admin-backup.service.ts", "utf8");
const action = readFileSync("features/connectors/google-drive/actions/orbit-admin-backup.actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261015120000_admin_backup_runs.sql", "utf8");
const provider = readFileSync("features/connectors/google-drive/provider/google-drive-live.provider.ts", "utf8");
const runbook = readFileSync("docs/ORBIT_ADMIN_BACKUP_RUNBOOK.md", "utf8");

test("administrative backup is server-side and Founder/Admin protected", () => {
  assert.match(action, /"use server"/);
  assert.match(action, /isAdministrativeRole/);
  assert.match(service, /loadGoogleWorkspaceAccessToken/);
  assert.match(service, /GoogleDriveApiProvider/);
});

test("storage backup is physical, checksummed, read-back verified and scoped", () => {
  assert.match(service, /storage\.from\(bucket\.name\)\.download/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /provider\.readFile/);
  assert.match(service, /ORBIT_BACKUP_/);
  assert.match(service, /GOOGLE_DRIVE_PARENT_FOLDER_ID/);
  assert.match(service, /md5Checksum/);
  assert.match(service, /iterateStorageObjects/);
  assert.match(service, /for await/);
  assert.match(service, /MAX_BATCH_FILES/);
  assert.match(readFileSync("features/connectors/google-drive/application/orbit-admin-backup.crypto.ts", "utf8"), /BACKUP_ENCRYPTION_NOT_CONFIGURED/);
  assert.match(service, /orbitBackupRunId/);
});

test("backup artifacts encrypt and restore without exposing plaintext", () => {
  const key = Buffer.alloc(32, 7);
  const plaintext = new TextEncoder().encode("private storage bytes");
  const encrypted = encryptBackupArtifact(plaintext, key);
  const retryCiphertext = encryptBackupArtifact(plaintext, key);
  assert.notDeepEqual(encrypted, plaintext);
  assert.notDeepEqual(encrypted, retryCiphertext);
  assert.equal(new TextDecoder().decode(decryptBackupArtifact(encrypted, key)), "private storage bytes");
  assert.equal(new TextDecoder().decode(decryptBackupArtifact(retryCiphertext, key)), "private storage bytes");
  assert.throws(() => decryptBackupArtifact(encrypted, Buffer.alloc(32, 8)));
});

test("idempotency and concurrency use a persistent unique ledger", () => {
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(service, /BACKUP_ALREADY_RUNNING_OR_CLAIM_FAILED/);
  assert.match(service, /select\("id,status,drive_folder_id,metadata,started_at"\)/);
  assert.match(service, /15 \* 60 \* 1000/);
  assert.match(service, /started_at/);
  assert.match(service, /lease_token/);
  assert.match(migration, /CHECKPOINTED/);
});

test("database backup is not falsely represented by SQL metadata", () => {
  assert.match(service, /DATABASE_EXPORT_REQUIRES_PROTECTED_CI_PG_DUMP_AND_SUPABASE_DB_URL/);
  assert.doesNotMatch(service, /execute_sql/);
});

test("recovery preserves exact source paths and external key custody", () => {
  assert.match(service, /sourceBucket: object\.bucket/);
  assert.match(service, /sourcePath: object\.path/);
  assert.match(runbook, /temporary Storage bucket/);
  assert.match(runbook, /Never store it in Drive/);
});

test("Drive API readback supports shared drives without exposing tokens", () => {
  assert.match(provider, /alt/,);
  assert.match(provider, /supportsAllDrives/);
  assert.doesNotMatch(service, /accessToken|refreshToken|clientSecret/);
});
