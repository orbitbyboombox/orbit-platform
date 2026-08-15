import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { missingPhysicalUnits, operationalWindowsOverlap } from "../../features/operations/resource-planning.ts";

const migration = readFileSync(new URL("../../supabase/migrations/0128_operations_phase_c_resource_planning.sql", import.meta.url), "utf8");
const eventPanel = readFileSync(new URL("../../features/asset-management/equipment-assignment-panel.tsx", import.meta.url), "utf8");
const staffPortal = readFileSync(new URL("../../features/portal-authentication/staff-portal.tsx", import.meta.url), "utf8");
const operations = readFileSync(new URL("../../app/(platform)/operations/page.tsx", import.meta.url), "utf8");

test("same-day resources conflict only when complete operational windows overlap", () => {
  const morning = { startAt: "2026-08-21T12:00:00Z", endAt: "2026-08-21T16:00:00Z" };
  const evening = { startAt: "2026-08-21T20:00:00Z", endAt: "2026-08-22T01:00:00Z" };
  const overlap = { startAt: "2026-08-21T15:59:00Z", endAt: "2026-08-21T18:00:00Z" };
  const consecutive = { startAt: morning.endAt, endAt: "2026-08-21T19:00:00Z" };
  assert.equal(operationalWindowsOverlap(morning, evening), false);
  assert.equal(operationalWindowsOverlap(morning, overlap), true);
  assert.equal(operationalWindowsOverlap(morning, consecutive), false);
  assert.match(migration, /tstzrange\(planned_start_at,planned_end_at,'\[\)'\) with &&/);
  assert.match(migration, /exclusion_violation/);
});

test("requirements support multiple physical units and insufficient inventory", () => {
  assert.equal(missingPhysicalUnits(3, 0), 3);
  assert.equal(missingPhysicalUnits(3, 2), 1);
  assert.equal(missingPhysicalUnits(2, 2), 0);
  assert.match(migration, /service_row\.quantity\*coalesce\(mapping_row\.units_per_service,1\)/);
  assert.match(migration, /current_count\+requested_count>ceil\(requirement\.required_quantity\)/);
  assert.match(eventPanel, /Asignar.*equipo/);
});

test("mapping and availability buffers are canonical and configurable", () => {
  assert.match(migration, /service_asset_type_mappings/);
  assert.match(migration, /buffer_before_minutes integer not null default 0/);
  assert.match(migration, /buffer_after_minutes integer not null default 0/);
  assert.match(migration, /make_interval\(mins=>coalesce\(buffer_before,0\)\)/);
  assert.match(migration, /make_interval\(mins=>coalesce\(buffer_after,0\)\)/);
});

test("assignment, removal and replacement preserve audit history", () => {
  assert.match(migration, /create or replace function public\.assign_operational_assets/);
  assert.match(migration, /create or replace function public\.release_operational_asset/);
  assert.match(migration, /create or replace function public\.replace_operational_asset/);
  assert.match(migration, /insert into public\.asset_history/);
  assert.match(migration, /replaced_by_assignment_id/);
  assert.match(eventPanel, /Reemplazar/);
  assert.match(eventPanel, /Quitar asignación/);
});

test("maintenance and out-of-service assets never count as ready", () => {
  assert.match(migration, /asset\.status not in\('MAINTENANCE','OUT_OF_SERVICE'\)/);
  assert.match(migration, /asset_health_resource_alert/);
  assert.match(migration, /ASSIGNED_ASSET_UNAVAILABLE/);
});

test("readiness and Operations expose physical resource completeness", () => {
  assert.match(migration, /'RESOURCE:'\|\|resource_row\.id/);
  assert.match(migration, /perform public\.refresh_event_operational_readiness/);
  assert.match(operations, /label:"Recursos"/);
  assert.match(operations, /resourcesRequired/);
});

test("Staff sees confirmed physical resource codes without assignment controls", () => {
  assert.match(staffPortal, /from\("asset_assignments"\)/);
  assert.match(staffPortal, /physicalResources/);
  assert.doesNotMatch(staffPortal, /assignPhysicalResourcesAction|replacePhysicalResourceAction/);
});

test("migration never invents an assignment or deletes inventory", () => {
  const backfill = migration.slice(migration.indexOf("-- Deterministic classification/backfill"));
  assert.doesNotMatch(backfill, /insert into public\.asset_assignments/);
  assert.doesNotMatch(migration, /delete from public\.operational_assets/);
  assert.doesNotMatch(migration, /truncate/);
});
