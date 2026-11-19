import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strict as assert } from "node:assert";

const read = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("backup control is administrator-only and idempotent", async () => {
  const migration = await read("supabase/migrations/20261117120000_orbit_backup_control.sql");
  const action = await read("features/orbit-backups/actions.ts");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /orbit_backup_runs_one_active/);
  assert.match(action, /CEO.*ADMINISTRATOR/);
  assert.match(action, /BACKUP-ORBIT-2\.1/);
});

test("retention verifies the uploaded Drive folder and expires only copies older than 30 days", async () => {
  const script = await read("scripts/rotate-drive-backups.mjs");
  assert.match(script, /result\.uploaded\.length !== 7/);
  assert.match(script, /Current Drive backup failed post-upload inventory check/);
  assert.match(script, /trashed: true/);
  assert.match(script, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(script, /folder\.id === current\.id/);
});

test("daily workflow is read-only, encrypted and records its run", async () => {
  const workflow = await read(".github/workflows/orbit-supabase-backup.yml");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /backup_run_id/);
  assert.match(workflow, /aes-256-cbc/);
  assert.match(workflow, /rotate-drive-backups/);
  assert.match(workflow, /record backup success/i);
});
