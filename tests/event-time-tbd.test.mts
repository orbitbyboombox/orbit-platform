import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0254_event_time_estimated_reconcile.sql", "utf8");
const drawer = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
const quote = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");
const reminder = readFileSync("app/api/cron/staff-assignment-reminders/route.ts", "utf8");

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
