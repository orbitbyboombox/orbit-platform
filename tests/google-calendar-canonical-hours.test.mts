import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalOrbitEventStateFromRecord } from "../features/operations/canonical-orbit-event-state.ts";
import { chileDateTime, chileLocalToIso } from "../features/operations/event-operational-window.ts";

test("uses explicit founder citation instead of the default one-hour lead", () => {
  const state = buildCanonicalOrbitEventStateFromRecord({
    id: "project-override",
    orbit_event_id: "ORB-2026-162036",
    event_date: "2026-11-20",
    event_time: "18:30",
    event_time_mode: "CONFIRMED",
    duration_hours: 2,
    assignments: [{
      status: "ASSIGNED",
      staff_call_source: "FOUNDER_OVERRIDE",
      staff_call_at: chileLocalToIso("2026-11-20T17:00:00"),
    }],
  });
  assert.deepEqual(chileDateTime(state.staffCallAt), { date: "2026-11-20", time: "17:00" });
  assert.deepEqual(chileDateTime(state.serviceStartAt), { date: "2026-11-20", time: "18:30" });
  assert.deepEqual(chileDateTime(state.serviceEndAt), { date: "2026-11-20", time: "20:30" });
  assert.equal(state.staffCallSource, "FOUNDER_OVERRIDE");
});

test("preserves canonical operational contract times when service is not confirmed", () => {
  const state = buildCanonicalOrbitEventStateFromRecord({
    id: "project-contract",
    event_date: "2026-11-20",
    event_time: "18:30",
    event_time_mode: "PENDING",
    duration_hours: 2,
    project_operational_contracts: {
      service_start_at: chileLocalToIso("2026-11-20T19:00:00"),
      service_end_at: chileLocalToIso("2026-11-20T22:00:00"),
    },
  });
  assert.deepEqual(chileDateTime(state.serviceStartAt), { date: "2026-11-20", time: "19:00" });
  assert.deepEqual(chileDateTime(state.serviceEndAt), { date: "2026-11-20", time: "22:00" });
  assert.deepEqual(chileDateTime(state.staffCallAt), { date: "2026-11-20", time: "18:00" });
});

test("citation can be on the previous day for a midnight service", () => {
  const state = buildCanonicalOrbitEventStateFromRecord({
    id: "project-midnight",
    event_date: "2026-11-21",
    event_time: "00:00",
    event_time_mode: "CONFIRMED",
    duration_hours: 3,
  });
  assert.deepEqual(chileDateTime(state.staffCallAt), { date: "2026-11-20", time: "23:00" });
  assert.deepEqual(chileDateTime(state.serviceEndAt), { date: "2026-11-21", time: "03:00" });
});
