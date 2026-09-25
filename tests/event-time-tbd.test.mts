import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0254_event_time_estimated_reconcile.sql", "utf8");
const drawer = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
const quote = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");
const reminder = readFileSync("app/api/cron/staff-assignment-reminders/route.ts", "utf8");
const confirmationMigration = readFileSync("supabase/migrations/0255_event_time_confirmation_action.sql", "utf8");
const confirmationAction = readFileSync("features/projects/actions/event-time.actions.ts", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const integration = readFileSync("features/projects/components/production-integration-panel.tsx", "utf8");
const staffPortal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const staffDashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const staffProjection = readFileSync("supabase/migrations/0256_staff_event_time_mode_projection.sql", "utf8");

test("Phase A reconciliation defines the ESTIMATED/CONFIRMED contract", () => {
  assert.match(migration, /event_time_mode/);
  assert.match(migration, /event_time_window/);
  assert.match(migration, /event_time_confirmation_deadline/);
  assert.match(migration, /'CONFIRMED'/);
  assert.match(migration, /'ESTIMATED'/);
  assert.match(migration, /'22:00'/);
  assert.match(migration, /event_date - 7/);
});

test("estimated events use a real time and preliminary capacity", () => {
  assert.match(migration, /event_time = coalesce\(event_time, '22:00'/);
  assert.match(migration, /CAPACITY_PRELIMINARY/);
  assert.match(migration, /event_time is not null/);
});

test("manual reservation no longer permits a null event time", () => {
  assert.match(migration, /alter column event_time set not null/);
  assert.doesNotMatch(migration, /'00:00'/);
});

test("manual reservation UI exposes editable estimated and confirmed modes", () => {
  assert.match(drawer, /Horario estimado/);
  assert.match(drawer, /Horario confirmado/);
  assert.match(drawer, /22:00/);
  assert.match(drawer, /confirmarlo hasta 7 días/);
});

test("commercial quote UI exposes estimated time", () => {
  assert.match(quote, /eventTimeMode/);
  assert.match(quote, /CAPACITY_PRELIMINARY/);
  assert.match(quote, /Horario estimado/);
  assert.match(quote, /22:00/);
});

test("staff reminders do not use 00:00 as an unknown event time", () => {
  assert.doesNotMatch(reminder, /event_time\?\?"00:00"/);
});

test("automatic booking uses the editable 22:00 estimated default", () => {
  const automatic = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
  assert.match(automatic, /time: "22:00"/);
  assert.match(automatic, /CAPACITY_PRELIMINARY/);
  assert.match(automatic, /Horario estimado/);
});

test("Founder confirmation is atomic, authorized, capacity-gated, and auditable", () => {
  assert.match(confirmationMigration, /confirm_project_event_time/);
  assert.match(confirmationMigration, /can_administer/);
  assert.match(confirmationMigration, /preflight_reservation_capacity_confirmed/);
  assert.match(confirmationMigration, /CAPACITY_CONFLICT/);
  assert.match(confirmationMigration, /EVENT_TIME_CONFIRMED/);
  assert.match(confirmationMigration, /sync_event_operational_requirements/);
  assert.match(confirmationMigration, /recalculate_event_resource_assignments/);
  assert.match(confirmationMigration, /revoke all on function/);
});

test("Founder UI exposes the exact confirm/modify action with safe feedback", () => {
  assert.match(workspace, /CONFIRMAR \/ MODIFICAR HORARIO/);
  assert.match(workspace, /Guardando y recalculando/);
  assert.match(confirmationAction, /CAPACITY_CONFLICT/);
  assert.match(confirmationAction, /Este horario genera un conflicto de disponibilidad/);
  assert.match(confirmationAction, /synchronizeConfirmedReservationCalendar/);
});

test("estimated Calendar and Staff semantics cannot present a provisional time as final", () => {
  assert.match(integration, /PROVISIONAL · HORARIO ESTIMADO/);
  assert.match(integration, /No se crea un evento definitivo hasta confirmar el horario/);
  assert.match(staffPortal, /event_time_mode/);
  assert.doesNotMatch(staffPortal, /event_time\?\.slice\(0,5\)\?\?"00:00"/);
  assert.match(staffDashboard, /HORARIO CONFIRMADO/);
  assert.match(staffDashboard, /HORARIO ESTIMADO/);
  assert.match(staffProjection, /p\.event_time_mode/);
  assert.match(staffProjection, /security_invoker=true/);
});
