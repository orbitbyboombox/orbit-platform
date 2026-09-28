import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const calendarService = readFileSync("features/connectors/google-calendar/application/google-calendar-sync.service.ts", "utf8");
const calendarLive = readFileSync("features/connectors/google-calendar/application/google-calendar-live.ts", "utf8");
const provider = readFileSync("features/connectors/google-calendar/provider/google-calendar-live.provider.ts", "utf8");
const eventTimeAction = readFileSync("features/projects/actions/event-time.actions.ts", "utf8");
const resyncService = readFileSync("features/connectors/google-calendar/application/google-calendar-resync.service.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");

test("documents and profitability use full-width desktop sections with readable metric labels", () => {
  assert.match(workspace, /className="2xl:col-span-2"[\s\S]*title="Documentos y estado comercial"/);
  assert.match(workspace, /className="2xl:col-span-2"[\s\S]*title="Resumen financiero del evento"/);
  assert.match(workspace, /min-w-\[140px\][\s\S]*line-clamp-2 break-words/);
  assert.doesNotMatch(workspace, /\[&_dd\]:whitespace-nowrap/);
});

test("confirmed project time is the canonical Calendar start and keeps the existing event", () => {
  assert.match(calendarService, /const serviceStart=\{date:project\.event_date,time:legacyStart\}/);
  assert.match(calendarService, /calendarStart=serviceStart/);
  assert.match(calendarService, /findByOrbitEventId\(project\.orbit_event_id\)/);
  assert.match(calendarLive, /existing\.googleEventId/);
  assert.match(calendarLive, /updateEvent\(existing\.googleEventId, payload\)/);
});

test("Calendar reads the remote event after mutation and verifies Chile time", () => {
  assert.match(provider, /getEvent\(googleEventId: string\)/);
  assert.match(calendarLive, /CALENDAR_REMOTE_VERIFY_FAILED/);
  assert.match(calendarLive, /provider\.getEvent\(googleEventId\)/);
  assert.match(calendarLive, /America\/Santiago/);
  assert.match(calendarLive, /CALENDAR_TIME_SYNC_VERIFY/);
});

test("confirmed event time queues existing Calendar mappings for the privileged cron", () => {
  assert.match(eventTimeAction, /invalidateCalendarSyncForProject\(client, projectId\)/);
  assert.doesNotMatch(eventTimeAction, /synchronizeConfirmedReservationCalendar/);
  assert.match(resyncService, /in\("status", \["PENDING", "STALE", "FAILED"\]\)/);
  assert.match(resyncService, /\.eq\("status", "SYNCHRONIZED"\)/);
  assert.match(resyncService, /if \(row\.status === "SYNCHRONIZED"\)/);
  assert.match(resyncService, /claim_calendar_sync_for_resync/);
  assert.match(resyncService, /policy: "EXISTING_LEGACY_UPDATE"/);
  assert.match(middleware, /\/api\/cron\/google-calendar-resync/);
});
