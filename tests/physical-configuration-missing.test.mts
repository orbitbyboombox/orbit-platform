import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/0242_physical_configuration_alerts.sql", "utf8");
const agenda = readFileSync("app/(platform)/operations/week/page.tsx", "utf8");
const founder = readFileSync("features/founder-action-center/index.ts", "utf8");
const drawer = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
const reservationAction = readFileSync("features/projects/actions/customer.actions.ts", "utf8");

test("uses canonical undefined physical configuration and physical requirements", () => {
  assert.match(migration, /PHYSICAL_CONFIGURATION_MISSING/);
  assert.match(migration, /physicalConfiguration/);
  assert.match(migration, /requirement_type='PHYSICAL_UNIT'/);
  assert.match(migration, /agenda:physical-configuration:/);
});
test("is idempotent and auto-closes resolved configuration", () => {
  assert.match(migration, /on conflict\(correlation_id\) do update/);
  assert.match(migration, /status='RESOLVED'/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});
test("projects a compact agenda list with canonical workspace CTA", () => {
  assert.match(agenda, /Sin configuración física:/);
  assert.match(agenda, /Definir configuración/);
  assert.match(agenda, /physical-resource-planning/);
  assert.match(agenda, /slice\(0,5\)/);
});
test("exposes the alert in Founder action center", () => {
  assert.match(founder, /"PHYSICAL_CONFIGURATION_MISSING"/);
  assert.match(founder, /DEFINIR CONFIGURACIÓN/);
  assert.match(founder, /eventos sin configuración física/);
  assert.match(founder, /reconcile_operational_agenda_alerts/);
});

test("manual CLASSIC flow requires and persists the canonical shell", () => {
  assert.match(drawer, /Carcasa del tótem/);
  assert.match(drawer, /Selecciona WHITE o BLACK/);
  assert.match(drawer, /draft\.shellType/);
  assert.match(reservationAction, /set_event_shell_configuration/);
  assert.match(reservationAction, /p_shell_type: draft\.shellType/);
});
