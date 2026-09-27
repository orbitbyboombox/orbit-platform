import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const routeModel = readFileSync("supabase/migrations/0030_route_cost_engine.sql", "utf8");

test("Staff routes consume the persisted Admin route models", () => {
  assert.match(portal, /from\("vehicle_routes"\)/);
  assert.match(portal, /from\("vehicle_route_events"\)/);
  assert.match(portal, /from\("vehicle_trips"\)/);
  assert.match(portal, /from\("event_vehicle_assignments"\)/);
  assert.match(portal, /created_at.*ascending:true/);
  assert.match(routeModel, /save_vehicle_route/);
});

test("Staff routes are limited to real assembly/disassembly assignment scope", () => {
  assert.match(portal, /row\.staff_id !== staffId/);
  assert.match(portal, /ASSEMBLY.*DISASSEMBLY/);
  assert.match(portal, /route\.driver_staff_id === staffId/);
  assert.match(dashboard, /Solo aparecen rutas oficiales donde tienes una asignación compatible/);
});

test("Staff routes preserve independent montage and teardown blocks", () => {
  assert.match(dashboard, /\["MONTAJE", "DESMONTAJE"\]/);
  assert.match(portal, /DELIVERY_ASSEMBLY/);
  assert.match(portal, /PICKUP_DISASSEMBLY/);
  assert.match(dashboard, /RUTA OFICIAL/);
});

test("Staff routes expose operational stop data and the five-totem guard", () => {
  for (const label of ["date", "time", "event", "district", "address", "service", "equipment", "observations", "role", "status"]) {
    assert.match(portal, new RegExp(`${label}:`));
  }
  assert.match(dashboard, /route\.capacity > 5/);
  assert.match(dashboard, /máximo operativo de 5 tótems/);
  assert.match(dashboard, /Carga \{route\.capacity\}\/5/);
});

test("Staff routes keep the responsive mobile layout contained", () => {
  assert.match(dashboard, /grid gap-2 sm:grid-cols/);
  assert.match(dashboard, /flex flex-col gap-4 sm:flex-row/);
  assert.match(dashboard, /details className/);
});
