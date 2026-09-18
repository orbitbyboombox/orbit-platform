import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260917240000_founder_force_delete_saga.sql", "utf8");
const cleanup = readFileSync("features/projects/event-deletion-cleanup.service.ts", "utf8");
const cron = readFileSync("app/api/cron/event-deletion-cleanup/route.ts", "utf8");

test("force delete is CEO-only, confirmation-gated and creates an idempotent saga job", () => {
  assert.match(migration, /current_orbit_role\(\) <> 'CEO'/);
  assert.match(migration, /upper\(trim\(coalesce\(p_confirmation/);
  assert.match(migration, /event_deletion_jobs/);
  assert.match(migration, /status','REMOVED_FROM_OPERATION'/);
  assert.match(migration, /on conflict|select \* into existing_job/);
});

test("financial evidence is preserved while operational exposure is removed", () => {
  assert.match(migration, /SOURCE_EVENT_DELETED/);
  assert.match(migration, /has_real_finance/);
  assert.doesNotMatch(migration, /delete from public\.timeline_events/i);
});

test("external cleanup is retryable and serializes structured errors", () => {
  assert.match(cleanup, /status: \"EXTERNAL_CLEANUP\"/);
  assert.match(cleanup, /FAILED_RETRYABLE/);
  assert.match(cleanup, /projectId/);
  assert.match(cleanup, /cleanupStage/);
  assert.match(cleanup, /correlationId/);
  assert.match(cron, /CRON_SECRET/);
});
