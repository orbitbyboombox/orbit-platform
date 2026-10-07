import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0159_logistics_route_publication.sql", "utf8");
const admin = readFileSync("features/resources/staff-logistics-view.tsx", "utf8");
const staff = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");

test("route publication extends the canonical route model", () => {
  assert.match(migration, /alter table public\.vehicle_routes/);
  assert.match(migration, /route_type text/);
  assert.match(migration, /publication_status text/);
  assert.match(migration, /publication_version integer/);
  assert.match(migration, /sequence integer/);
});

test("Admin saves proposals and publishes explicitly", () => {
  assert.match(admin, /ORDENAR POR SECTOR Y HORA/);
  assert.match(admin, /ORDENAR POR SECTOR Y HORA/);
  assert.match(admin, /ASIGNAR Y PUBLICAR/);
  assert.match(migration, /save_logistics_route_plan/);
  assert.match(migration, /publish_logistics_route/);
});

test("published route revisions preserve the Staff-visible version", () => {
  assert.match(migration, /vehicle_route_revisions/);
  assert.match(migration, /vehicle_route_revision_events/);
  assert.match(staff, /publication_status.*PUBLISHED/);
  assert.match(staff, /publishedRevisionByRoute/);
});

test("Staff route direction and publication scope stay assignment-aware", () => {
  assert.match(staff, /route\.route_type === "ASSEMBLY"/);
  assert.match(staff, /route\.route_type === "DISASSEMBLY"/);
  assert.match(staff, /staffRouteRoles/);
  assert.match(migration, /internal_notifications/);
});
