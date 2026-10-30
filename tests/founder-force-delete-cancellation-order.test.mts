import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261029162000_founder_force_delete_restore_cancellation_order.sql",
  "utf8",
);

test("restores the explicit cancellation delete before settlement cleanup", () => {
  assert.match(migration, /replace\(ddl, marker[\s\S]*delete from public\.staff_assignment_cancellations/i);
  assert.doesNotMatch(migration, /delete from public\.timeline_events|delete from public\.customers/i);
});
