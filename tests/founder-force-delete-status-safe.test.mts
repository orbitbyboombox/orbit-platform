import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const normal = readFileSync("supabase/migrations/20260922150000_founder_force_delete_preserve_commercial_history.sql", "utf8");
const repair = readFileSync("supabase/migrations/20260923120000_founder_force_delete_status_safe_qa.sql", "utf8");
const policy = readFileSync("features/founder-force-delete/policy.ts", "utf8");
const action = readFileSync("features/projects/actions/reservation-lifecycle.actions.ts", "utf8");

test("normal Founder delete detaches reservation linkage without mutating lifecycle status", () => {
  assert.match(normal, /update public\.reservation_transactions set project_id=null, orbit_event_id=null, current_step='EVENT_DELETED'/);
  assert.doesNotMatch(normal, /update public\.reservation_transactions[\s\S]{0,220}status='CANCELLED'/i);
});

test("QA purge is isolated, CEO-gated and requires the exact second confirmation", () => {
  assert.match(repair, /purge_event_test_full/);
  assert.match(repair, /current_orbit_role\(\) <> 'CEO'/);
  assert.match(repair, /PURGAR PRUEBA/);
  assert.match(repair, /data_classification not in \('QA','TEST'\)/);
  assert.match(policy, /TEST_FULL_PURGE_CONFIRMATION = "PURGAR PRUEBA"/);
  assert.match(action, /client\.rpc\("purge_event_test_full"/);
});

test("canonical reservation transaction check remains unchanged", () => {
  assert.match(repair, /STARTED|CREATED|PROCESSING|FAILED|COMPLETED/);
  assert.doesNotMatch(repair, /status='CANCELLED', current_step='EVENT_DELETED'/);
});
