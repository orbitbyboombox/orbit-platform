import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261029152000_founder_force_delete_asset_children_safe.sql",
  "utf8",
);

test("event-exclusive asset children are removed before asset assignments", () => {
  const reloads = migration.indexOf("delete from public.event_paper_reloads");
  const snapshots = migration.indexOf("delete from public.event_paper_snapshots");
  const inspections = migration.indexOf("delete from public.asset_assignment_inspections");
  const incidents = migration.indexOf("delete from public.event_incidents");
  const assignments = migration.lastIndexOf("delete from public.asset_assignments where project_id=p_project_id");
  assert.ok(reloads >= 0 && snapshots > reloads && inspections > snapshots && incidents > inspections && assignments > incidents);
});

test("the repair is scoped to the event and does not remove inventory masters", () => {
  assert.match(migration, /where project_id=p_project_id/i);
  assert.match(migration, /asset_assignment_id in \([\s\S]*where project_id=p_project_id/i);
  assert.doesNotMatch(migration, /delete from public\.operational_assets/i);
  assert.doesNotMatch(migration, /delete from public\.timeline_events/i);
});
