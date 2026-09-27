import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260927120000_route_first_vehicle_optional.sql", import.meta.url), "utf8");
const view = await readFile(new URL("../features/resources/staff-logistics-view.tsx", import.meta.url), "utf8");
const portal = await readFile(new URL("../features/portal-authentication/staff-portal.tsx", import.meta.url), "utf8");

test("routes may exist without transport assignments", () => {
  assert.match(migration, /alter column asset_id drop not null/);
  assert.match(migration, /La ruta requiere fecha y eventos/);
  assert.doesNotMatch(migration, /La ruta requiere vehículo, fecha y eventos/);
});

test("route staff assignment is canonical for publication and portal visibility", () => {
  assert.match(migration, /create table if not exists public\.route_staff_assignments/);
  assert.match(migration, /set_logistics_route_staff/);
  assert.match(migration, /route_staff_assignments where route_id=p_route_id and status='ASSIGNED'/);
  assert.match(portal, /route_staff_assignments!inner\(staff_id,status\)/);
  assert.match(portal, /route_staff_assignments\.staff_id/);
});

test("Admin UI presents vehicle as optional and requires staff before sharing", () => {
  assert.match(view, /Vehículo por confirmar/);
  assert.match(view, /Asigna al menos una persona para publicar/);
  assert.match(view, /draft\.staffIds\.length/);
});
