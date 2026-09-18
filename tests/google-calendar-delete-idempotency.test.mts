import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providerSource = await readFile(new URL("../features/connectors/google-calendar/provider/google-calendar-live.provider.ts", import.meta.url), "utf8");
const deleteServiceSource = await readFile(new URL("../features/connectors/google-calendar/application/google-calendar-delete.service.ts", import.meta.url), "utf8");
const cleanupSource = await readFile(new URL("../features/projects/event-deletion-cleanup.service.ts", import.meta.url), "utf8");
const lifecycleSource = await readFile(new URL("../features/projects/actions/reservation-lifecycle.actions.ts", import.meta.url), "utf8");

test("Founder deletion uses the canonical mapping, tombstones it, and never creates Calendar events", () => {
  assert.match(deleteServiceSource, /external_event_id,nova_external_event_id/);
  assert.match(deleteServiceSource, /eventIds/);
  assert.match(deleteServiceSource, /status: "DELETED"/);
  assert.match(deleteServiceSource, /external_url: null/);
  assert.match(deleteServiceSource, /nova_external_url: null/);
  assert.match(deleteServiceSource, /onConflict: "correlation_id"/);
  assert.match(deleteServiceSource, /provider\.deleteEvent/);
  assert.doesNotMatch(deleteServiceSource, /provider\.createEvent|provider\.updateEvent/);
  assert.match(cleanupSource, /deleteCalendarEventForProject/);
  assert.match(cleanupSource, /calendarEventIds/);
  assert.doesNotMatch(cleanupSource, /calendar\.createEvent|calendar\.updateEvent/);
  assert.match(lifecycleSource, /purge_event_controlled/);
  assert.match(lifecycleSource, /deleteCalendarEventForProject\(\{ client, projectId, actorId/);
  assert.match(lifecycleSource, /founder_force_delete\.calendar_cleanup/);
  assert.match(lifecycleSource, /FAILED_RETRYABLE/);
});

test("Calendar delete contract covers no mapping, repeated delete, 404 and transient errors", () => {
  assert.match(deleteServiceSource, /status: "NO_MAPPING"/);
  assert.match(deleteServiceSource, /status === "DELETED"/);
  assert.match(providerSource, /response\.status !== 404 && response\.status !== 410/);
  assert.match(providerSource, /method: "DELETE"/);
  assert.match(providerSource, /Google Calendar delete failed \(\$\{response\.status\}\)/);
  assert.doesNotMatch(cleanupSource, /search.*title|search.*date/i);
});
