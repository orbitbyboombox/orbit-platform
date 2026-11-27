import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("features/connectors/google-calendar/application/google-calendar-remote-reconciliation.ts", "utf8");
const actions = readFileSync("features/connectors/google-calendar/application/google-calendar.actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261127190000_canonical_calendar_update.sql", "utf8");

test("canonical Calendar update is an authenticated, existing-event-only flow", () => {
  assert.match(source, /updateCanonicalCalendarEvent/);
  assert.match(source, /findEventsByOrbitEventId/);
  assert.match(source, /provider\.updateEvent\(eventId, expectedPayload, before\.etag\)/);
  assert.match(source, /apply_canonical_calendar_event_update/);
  assert.doesNotMatch(source, /provider\.createEvent\(/);
  assert.doesNotMatch(source, /provider\.deleteEvent\(/);
  assert.match(actions, /updateCanonicalGoogleCalendarAction/);
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /revoke all on function public\.apply_canonical_calendar_event_update/);
  assert.match(migration, /return 'ALREADY_SYNCHRONIZED'/);
});

test("canonical update persists only after ETag-backed readback", () => {
  assert.match(source, /const before = await provider\.getEvent\(eventId\)/);
  assert.match(source, /const after = await provider\.getEvent\(eventId\)/);
  assert.match(source, /after\.etag === before\.etag/);
  assert.match(source, /verifyApprovedRemoteEvent\(input, expectedPayload, after\)/);
  assert.match(migration, /p_remote_snapshot->>'calendarId'/);
  assert.match(migration, /p_remote_snapshot->>'etag'/);
});
