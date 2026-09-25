import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260925180000_event_time_phase_a_production_contract.sql", "utf8");
const manual = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
const automatic = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const action = readFileSync("features/projects/actions/event-time.actions.ts", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const integration = readFileSync("features/projects/components/production-integration-panel.tsx", "utf8");
const staff = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const staffDashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const repository = readFileSync("features/projects/infrastructure/supabase-customer.repository.ts", "utf8");

test("contract defines estimated and confirmed modes with the 22:00 default", () => {
  assert.match(migration, /'ESTIMATED'/);
  assert.match(migration, /'CONFIRMED'/);
  assert.match(manual, /time: "22:00"/);
  assert.match(automatic, /time: "22:00"/);
});

test("manual and automatic flows preserve estimated semantics", () => {
  assert.match(manual, /timeMode: "ESTIMATED"/);
  assert.match(manual, /Puedes reservar utilizando un horario estimado/);
  assert.match(automatic, /timeMode: "ESTIMATED"/);
});

test("deadline is derived seven days before the event", () => {
  assert.match(migration, /event_date - 7/);
  assert.match(workspace, /deadline\.setUTCDate\(deadline\.getUTCDate\(\) - 7\)/);
});

test("Founder confirm/modify uses the canonical RPC", () => {
  assert.match(action, /confirm_project_event_time/);
  assert.match(workspace, /CONFIRMAR \/ MODIFICAR HORARIO/);
  assert.match(workspace, /disabled=\{eventTimePending\}/);
});

test("capacity conflicts are surfaced without a false success", () => {
  assert.match(migration, /CAPACITY_CONFLICT/);
  assert.match(action, /CAPACITY_CONFLICT/);
  assert.match(action, /conflicto de disponibilidad/);
});

test("confirmation recalculates operational dependencies and Calendar", () => {
  assert.match(migration, /sync_event_operational_requirements/);
  assert.match(migration, /recalculate_event_resource_assignments/);
  assert.match(action, /synchronizeConfirmedReservationCalendar/);
});

test("estimated Calendar is provisional and does not offer final sync", () => {
  assert.match(integration, /PROVISIONAL · HORARIO ESTIMADO/);
  assert.match(integration, /No se crea un evento definitivo hasta confirmar el horario/);
  assert.match(integration, /eventTimeMode===\"CONFIRMED\"/);
});

test("Staff labels both modes and reads the canonical column", () => {
  assert.match(staff, /event_time_mode/);
  assert.match(staffDashboard, /HORARIO CONFIRMADO/);
  assert.match(staffDashboard, /HORARIO ESTIMADO/);
});

test("legacy null times remain non-fabricated in the read model", () => {
  assert.match(repository, /time: row\.event_time\?\.slice\(0, 5\) \?\? \"\"/);
  assert.doesNotMatch(repository, /event_time\?\.slice\(0, 5\) \?\? \"00:00\"/);
});

test("true midnight is not treated as missing", () => {
  assert.match(migration, /event_time is not null/);
  assert.match(repository, /row\.event_time\?\.slice\(0, 5\)/);
});

test("append-only timeline confirmation is auditable", () => {
  assert.match(migration, /EVENT_TIME_CONFIRMED/);
  assert.match(migration, /timeline_events/);
  assert.match(migration, /Administrator/);
});

test("confirmation is server-side and authorized", () => {
  assert.match(action, /\"use server\"/);
  assert.match(migration, /can_administer/);
  assert.match(migration, /revoke all on function public\.confirm_project_event_time/);
});

test("duplicate submission is disabled while confirmation is pending", () => {
  assert.match(workspace, /eventTimePending/);
  assert.match(workspace, /if \(!props\.projectKey \|\| eventTimePending\) return/);
});
