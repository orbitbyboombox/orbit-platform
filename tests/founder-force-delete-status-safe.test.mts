import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const normal = readFileSync("supabase/migrations/20260922150000_founder_force_delete_preserve_commercial_history.sql", "utf8");
const repair = readFileSync("supabase/migrations/20260923120000_founder_force_delete_status_safe_qa.sql", "utf8");
const timelineFix = readFileSync("supabase/migrations/20260923193000_founder_force_delete_timeline_append_only_safe.sql", "utf8");
const taskFix = readFileSync("supabase/migrations/20260923201500_founder_force_delete_task_tombstone_safe.sql", "utf8");
const graphFix = readFileSync("supabase/migrations/20260923213000_founder_force_delete_graph_preflight.sql", "utf8");
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

test("timeline audit remains append-only during QA purge", () => {
  assert.match(timelineFix, /ddl := replace\(ddl,[\s\S]*timeline_events is intentionally preserved/);
  assert.match(timelineFix, /ddl := replace\(ddl,[\s\S]*update public\.crm_events/);
  assert.match(timelineFix, /ddl := replace\(ddl,[\s\S]*update public\.projects/);
  assert.match(timelineFix, /timeline_events.*append-only|append-only.*timeline_events/i);
  assert.match(policy, /auditoría histórica está protegida/);
});

test("normal purge tombstones timeline-linked tasks instead of cascading into audit", () => {
  assert.match(taskFix, /update public\.tasks/);
  assert.match(taskFix, /where project_id=p_project_id/);
  assert.match(taskFix, /deleted_at=now\(\)/);
  assert.match(taskFix, /ddl := replace\(ddl, expected/);
  assert.match(taskFix, /tasks\.timeline_reference|timeline-linked tasks|append-only audit/i);
});

test("canonical graph fix keeps task scope valid and preflights append-only parents", () => {
  assert.match(graphFix, /preflight_purge_event_controlled/);
  assert.match(graphFix, /TASK_SCOPE_INVALID_BEFORE_PURGE/);
  assert.match(graphFix, /SOFT_DELETE_PROJECT_PRESERVE_APPEND_ONLY_PARENTS/);
  assert.match(graphFix, /status='COMPLETED'/);
  assert.doesNotMatch(graphFix, /set project_id=null,\s*orbit_event_id=null,\s*status='COMPLETED'/);
  assert.match(graphFix, /timeline_events where communication_id=public\.communications\.id/);
  assert.match(graphFix, /not exists \(select 1 from public\.timeline_events where agreement_id=public\.agreements\.id\)/);
  assert.match(graphFix, /Founder purge preflight blocked/);
});

test("successful normal delete uses the human success message", () => {
  assert.match(action, /Evento eliminado correctamente\./);
});