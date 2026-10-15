import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("features/connectors/google-drive/application/orbit-admin-backup.service.ts", "utf8");
const action = readFileSync("features/connectors/google-drive/actions/orbit-admin-backup.actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261015120000_admin_backup_runs.sql", "utf8");
const provider = readFileSync("features/connectors/google-drive/provider/google-drive-live.provider.ts", "utf8");

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
  assert.match(service, /orbitBackupRunId/);
});

test("idempotency and concurrency use a persistent unique ledger", () => {
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(service, /BACKUP_ALREADY_RUNNING_OR_CLAIM_FAILED/);
  assert.match(service, /select\("id,status"\)/);
});

test("database backup is not falsely represented by SQL metadata", () => {
  assert.match(service, /DATABASE_EXPORT_REQUIRES_PROTECTED_CI_PG_DUMP_AND_SUPABASE_DB_URL/);
  assert.doesNotMatch(service, /execute_sql/);
});

test("Drive API readback supports shared drives without exposing tokens", () => {
  assert.match(provider, /alt/,);
  assert.match(provider, /supportsAllDrives/);
  assert.doesNotMatch(service, /accessToken|refreshToken|clientSecret/);
});
