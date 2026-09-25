import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0253_event_time_tbd_contract.sql", "utf8");
const drawer = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
const quote = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");
const reminder = readFileSync("app/api/cron/staff-assignment-reminders/route.ts", "utf8");

test("Phase A migration defines the explicit event-time contract", () => {
  assert.match(migration, /event_time_mode/);
  assert.match(migration, /event_time_window/);
  assert.match(migration, /event_time_confirmation_deadline/);
  assert.match(migration, /'CONFIRMED'/);
  assert.match(migration, /'TBD'/);
  assert.match(migration, /event_date - 7/);
});

test("TBD events never enter the operational window", () => {
  assert.match(migration, /p\.event_time_mode='CONFIRMED'/);
  assert.match(migration, /CAPACITY_PENDING_TIME/);
});

test("manual reservation keeps null time instead of inventing a fallback", () => {
  assert.match(migration, /nullif\(d_event->>'time',''\)::time/);
  assert.doesNotMatch(migration, /'00:00'/);
});

test("manual reservation UI exposes confirmed and TBD modes", () => {
  assert.match(drawer, /Hora confirmada/);
  assert.match(drawer, /Por definir/);
  assert.match(drawer, /PENDING_TIME/);
});

test("commercial quote UI exposes a pending-time state", () => {
  assert.match(quote, /eventTimeMode/);
  assert.match(quote, /CAPACITY_PENDING_TIME/);
  assert.match(quote, /HORARIO PENDIENTE|PENDING_TIME/);
});

test("staff reminders do not use 00:00 as an unknown event time", () => {
  assert.doesNotMatch(reminder, /event_time\?\?"00:00"/);
});
