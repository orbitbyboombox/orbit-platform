import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/migrations/0129_operations_phase_d_staff_execution.sql`, "utf8");
const portal = readFileSync(`${root}/features/portal-authentication/staff-portal-dashboard.tsx`, "utf8");
const staffProjection = readFileSync(`${root}/features/portal-authentication/staff-portal.tsx`, "utf8");

test("Phase D preserves one canonical assignment and settlement transaction", () => {
  assert.match(migration, /assign_event_operational_responsibility/);
  assert.match(migration, /refresh_staff_event_payment/);
  assert.match(migration, /event_staff_payments set status='CONFIRMED'/);
  assert.doesNotMatch(migration, /create table if not exists public\.(staff_assignments|staff_settlements)/);
});

test("staff demand supports independent quantities and publication per role", () => {
  assert.match(migration, /unique\(project_id,role\)/);
  assert.match(migration, /required_quantity integer/);
  assert.match(migration, /assigned_count>=required_count/);
  assert.match(staffProjection, /event_staff_requirements/);
});

test("Portal Staff execution is role-aware and shares arrival", () => {
  for (const action of ["ARRIVED", "ASSEMBLY_STARTED", "ASSEMBLY_COMPLETED", "EVENT_STARTED", "EVENT_FINISHED", "DISASSEMBLY_STARTED", "DISASSEMBLY_COMPLETED"])
    assert.match(portal, new RegExp(action));
  assert.match(portal, /executionActions\(event\.roles\)/);
  assert.match(portal, /participationCompleted/);
});

test("availability stays private before canonical confirmation", () => {
  assert.match(staffProjection, /customer:"Evento BOOMBOX"/);
  assert.match(staffProjection, /clientPhone:"Disponible después de confirmación"/);
  assert.match(staffProjection, /address:"Disponible después de confirmación"/);
});
