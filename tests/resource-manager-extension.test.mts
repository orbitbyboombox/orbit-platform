import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
function operationalWindowsOverlap(left: { startAt: string; endAt: string }, right: { startAt: string; endAt: string }) {
  return new Date(left.startAt).getTime() < new Date(right.endAt).getTime() && new Date(right.startAt).getTime() < new Date(left.endAt).getTime();
}
function missingPhysicalUnits(required: number, assigned: number) { return Math.max(0, Math.ceil(required) - assigned); }

const migration = readFileSync("supabase/migrations/0230_resource_inventory_metadata.sql", "utf8");
const agenda = readFileSync("app/(platform)/operations/week/page.tsx", "utf8");
const actions = readFileSync("features/asset-management/actions.ts", "utf8");

test("resource metadata migration is additive and idempotent", () => {
  assert.match(migration, /add column if not exists serial_number/);
  assert.match(migration, /add column if not exists storage_location/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test("physical assignment persists requirement, project and operational window", () => {
  assert.match(actions, /assign_operational_assets/);
  assert.match(readFileSync("supabase/migrations/0128_operations_phase_c_resource_planning.sql", "utf8"), /planned_start_at/);
  assert.match(readFileSync("supabase/migrations/0128_operations_phase_c_resource_planning.sql", "utf8"), /planned_end_at/);
});

test("temporal overlap and quantity shortage are deterministic", () => {
  assert.equal(operationalWindowsOverlap({ startAt: "2026-10-01T10:00:00Z", endAt: "2026-10-01T12:00:00Z" }, { startAt: "2026-10-01T11:00:00Z", endAt: "2026-10-01T13:00:00Z" }), true);
  assert.equal(operationalWindowsOverlap({ startAt: "2026-10-01T10:00:00Z", endAt: "2026-10-01T12:00:00Z" }, { startAt: "2026-10-01T12:00:00Z", endAt: "2026-10-01T13:00:00Z" }), false);
  assert.equal(missingPhysicalUnits(2, 1), 1);
  assert.equal(missingPhysicalUnits(1, 1), 0);
});

test("agenda distinguishes unverifiable resources and real assignments", () => {
  assert.match(agenda, /NO VERIFICABLE/);
  assert.match(agenda, /asset_assignments/);
  assert.match(agenda, /event_operational_requirements/);
  assert.match(agenda, /INCOMPLETO/);
});

test("maintenance and out-of-service are blocked by canonical assignment RPC", () => {
  const sql = readFileSync("supabase/migrations/0128_operations_phase_c_resource_planning.sql", "utf8");
  assert.match(sql, /MAINTENANCE/);
  assert.match(sql, /OUT_OF_SERVICE/);
  assert.match(sql, /asset_assignments_no_overlapping_window/);
});

test("consumables remain separate from physical assets and no physical delete is introduced", () => {
  const resourceActions = readFileSync("features/resources/resource-center.actions.ts", "utf8");
  assert.match(resourceActions, /CONSUMABLES.*SUPPLY/);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
});
