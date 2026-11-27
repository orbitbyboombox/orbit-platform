import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roster = readFileSync("features/staff-roster/official-staff-roster.ts", "utf8");
const actions = readFileSync("features/staff-roster/official-staff-roster.actions.ts", "utf8");
const control = readFileSync("features/staff-roster/official-staff-roster-control.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261128090000_event_manual_roster_members.sql", "utf8");

test("los integrantes manuales quedan separados de asignaciones y finanzas", () => {
  assert.match(migration, /create table if not exists public\.event_manual_roster_members/);
  assert.match(roster, /event_manual_roster_members/);
  assert.match(control, /No crean asignaciones, pagos, gastos ni liquidaciones/);
  assert.doesNotMatch(roster, /assignments.*insert|insert.*assignments/);
});

test("el mantenimiento manual exige permisos administrativos y conserva soft delete", () => {
  assert.match(actions, /isAdministrativeRole\(profile\.role\)/);
  assert.match(roster, /deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(roster, /createManualRosterMember/);
  assert.match(roster, /updateManualRosterMember/);
  assert.match(roster, /deleteManualRosterMember/);
});

test("la nómina agrupa integrantes manuales por cargo y el logo tiene fallback de runtime", () => {
  assert.match(roster, /manualGroups/);
  assert.match(roster, /app\.bbox\.cl\/branding\/boombox-logo-official-white-email\.png/);
  assert.match(roster, /readOfficialRosterLogo/);
});
