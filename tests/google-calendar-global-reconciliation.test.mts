import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractVerifiedRemoteCitation } from "../features/connectors/google-calendar/application/calendar-remote-review-policy.ts";

const action = readFileSync("features/connectors/google-calendar/application/google-calendar.actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/0259_enforce_staff_call_exactly_60_minutes.sql", "utf8");

test("global Calendar reconciliation is future-only and reuses the persisted event ID", () => {
  assert.match(action, /\.gte\("event_date", todayChile\)/);
  assert.match(action, /expectedEventId/);
  assert.match(action, /actualEventId !== expectedEventId/);
  assert.match(action, /provider\.findEventsByOrbitEventId\(orbitEventId\)/);
  assert.match(action, /duplicateMatches\.length !== 1/);
  assert.match(action, /verifiedMapping\?\.nova_calendar_id !== calendarId/);
  assert.match(action, /result\.operation === "CREATED"/);
  assert.match(action, /EXISTING_LEGACY_UPDATE/);
});

test("Staff citation migration is exact minus 60 and excludes historical records", () => {
  assert.match(migration, /p_service_start_at - interval '60 minutes'/);
  assert.match(migration, /p\.event_date >= \(now\(\) at time zone 'America\/Santiago'\)::date/);
  assert.match(migration, /new\.event_date < \(now\(\) at time zone 'America\/Santiago'\)::date then return new/);
  assert.match(migration, /staff_call_at = fp\.call_at/);
  assert.match(migration, /STAFF_CALL_RECALCULATED/);
  assert.match(migration, /correlation_id/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.(projects|assignments|calendar_sync)/i);
});

const remoteReview = readFileSync("features/connectors/google-calendar/application/calendar-remote-review-policy.ts", "utf8");

test("remote citation validation tolerates wrapped lines and uses verified remote block", () => {
  assert.match(remoteReview, /const citationSection =/);
  assert.match(remoteReview, /const citationDate = numericDate\(start\.date\)/);
  assert.match(remoteReview, /remoteCitation\.includes\(start\.time\)/);
});

test("remote citation parser handles real Calendar line wrapping and verifies its date and time", () => {
  const description = "CITACIÓN OPERADORES BOOMBOX: viernes 20/11/2026 a las 17:30 (1 hora antes del\\nservicio).\\n\\nSERVICIO CLIENTE: sábado 21/11/2026 de 00:00 a 03:00 (3 horas).";
  const citation = extractVerifiedRemoteCitation(description, { date: "2026-11-20", time: "17:30" });
  assert.match(citation, /viernes 20\/11\/2026 a las 17:30/);
  assert.throws(() => extractVerifiedRemoteCitation(description, { date: "2026-11-20", time: "23:30" }), /esperada 20\/11\/2026 23:30; encontrada/);
});
