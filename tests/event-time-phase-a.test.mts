import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260925180000_event_time_phase_a_production_contract.sql", "utf8");
const stageMigration = readFileSync("supabase/migrations/20260928210000_event_time_confirmation_stage_logging.sql", "utf8");
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

test("confirmed preflight preserves auth protection while allowing the confirmation RPC to call it", () => {
  assert.match(stageMigration, /grant execute on function public\.preflight_reservation_capacity_confirmed\(uuid\) to authenticated/);
  assert.match(stageMigration, /security definer/);
  assert.match(stageMigration, /revoke all on function public\.confirm_project_event_time/);
  assert.match(stageMigration, /grant execute on function public\.confirm_project_event_time\(uuid, time\) to authenticated/);
});

test("confirmation logs every rollback stage and returns the canonical 24-hour time", () => {
  for (const stage of ["EVENT_TIME_UPDATE", "EVENT_TIME_CAPACITY", "EVENT_TIME_REQUIREMENTS", "EVENT_TIME_RESOURCE_ASSIGNMENTS", "EVENT_TIME_TIMELINE", "EVENT_TIME_RETURN"]) {
    assert.match(stageMigration, new RegExp(stage));
  }
  assert.match(stageMigration, /get stacked diagnostics/);
  assert.match(stageMigration, /requested_time/);
  assert.match(stageMigration, /to_char\(p_event_time, 'HH24:MI'\)/);
});

test("time input remains a 24-hour HH:mm value when sent to the RPC", () => {
  assert.match(action, /p_event_time: eventTime/);
  assert.match(action, /2\[0-3\]/);
  assert.match(workspace, /type="time"/);
  assert.match(workspace, /eventTimeDraft/);
});

test("duplicate submission is disabled while confirmation is pending", () => {
  assert.match(workspace, /eventTimePending/);
  assert.match(workspace, /if \(!props\.projectKey \|\| eventTimePending\) return/);
});
