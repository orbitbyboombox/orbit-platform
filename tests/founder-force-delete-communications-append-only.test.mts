import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261029150000_founder_force_delete_communications_append_only_safe.sql",
  "utf8",
);

test("communications linked to timeline history are detached before operational deletion", () => {
  assert.match(migration, /update public\.communications[\s\S]*set project_id=null/i);
  assert.match(migration, /exists \([\s\S]*from public\.timeline_events[\s\S]*communication_id=public\.communications\.id/i);
  assert.match(migration, /delete from public\.communications where project_id=p_project_id/i);
});

test("the repair preserves the append-only guard and changes only the canonical purge function", () => {
  assert.match(migration, /purge_event_controlled\(uuid,text,text,boolean\)/i);
  assert.doesNotMatch(migration, /disable trigger|drop trigger|hard_purge_test_mode/i);
  assert.doesNotMatch(migration, /delete from public\.timeline_events/i);
});
