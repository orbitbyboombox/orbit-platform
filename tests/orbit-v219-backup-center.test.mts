import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sessionPoolerConnection } from "../scripts/orbit-session-pooler.mjs";

const project = "uiwlcmbrowtmqwhnsnxz";
const host = "aws-1-us-west-2.pooler.supabase.com";

test("preserves the encoded password and pins the approved IPv4 session endpoint", () => {
  const direct = sessionPoolerConnection(`postgresql://postgres:ficticio%40abc%3A%25@db.${project}.supabase.co:5432/postgres`);
  const pool = sessionPoolerConnection(`postgresql://postgres.${project}:ficticio%40abc%3A%25@${host}:5432/postgres`);
  assert.deepEqual(direct, pool);
  assert.equal(direct.PGPASSWORD, "ficticio@abc:%");
  assert.equal(direct.PGHOST, host);
  assert.equal(direct.PGPORT, "5432");
  assert.throws(() => sessionPoolerConnection(`postgresql://postgres.${project}:x@${host}:6543/postgres`));
  assert.throws(() => sessionPoolerConnection("postgresql://postgres:x@supabase.example:5432/postgres"));
});

test("daily workflow gates automation and verifies the exact fresh copy before marking it verified", () => {
  const workflow = readFileSync(".github/workflows/orbit-supabase-backup.yml", "utf8");
  assert.match(workflow, /cron: "0 3 \* \* \*"\s+timezone: America\/Santiago/);
  assert.match(workflow, /ORBIT_BACKUP_AUTOMATION_ENABLED == 'true'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ORBIT_RESTORE_FOLDER_ID=.*drive-upload-result\.json/);
  assert.ok(workflow.indexOf("Restore PostgreSQL and Auth into isolated") < workflow.indexOf("orbit-backup-run.mjs verify"));
  assert.doesNotMatch(workflow, /rotate-drive-backups\.mjs/);
});
