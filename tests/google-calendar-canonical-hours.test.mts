import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("Event 360 uses confirmed canonical project hours instead of stale contract estimates", () => {
  const fixtures = [
    { id: "joaquin", date: "2026-11-20", time: "18:30", duration: 2, staleStart: "2026-11-20T22:00:00", staleEnd: "2026-11-21T00:00:00", expectedStart: "18:30", expectedEnd: "20:30" },
    { id: "softys", date: "2026-12-06", time: "15:30", duration: 4, staleStart: "2026-12-06T16:00:00", staleEnd: "2026-12-06T20:00:00", expectedStart: "15:30", expectedEnd: "19:30" },
    { id: "maria-jose", date: "2027-01-15", time: "23:30", duration: 3, staleStart: "2027-01-15T22:30:00", staleEnd: "2027-01-16T01:30:00", expectedStart: "23:30", expectedEnd: "02:30" },
  ];

  for (const fixture of fixtures) {
    const state = buildCanonicalOrbitEventStateFromRecord({
      id: fixture.id,
      event_date: fixture.date,
      event_time: fixture.time,
      event_time_mode: "CONFIRMED",
      duration_hours: fixture.duration,
      project_operational_contracts: {
        service_start_at: chileLocalToIso(fixture.staleStart),
        service_end_at: chileLocalToIso(fixture.staleEnd),
      },
    });
    assert.equal(chileDateTime(state.serviceStartAt).time, fixture.expectedStart, fixture.id);
    assert.equal(chileDateTime(state.serviceEndAt).time, fixture.expectedEnd, fixture.id);
  }

  const projectPage = readFileSync(new URL("../app/(platform)/projects/[projectId]/page.tsx", import.meta.url), "utf8");
  assert.match(projectPage, /serviceStartAt:\s*canonicalEventState\.serviceStartAt/);
  assert.match(projectPage, /serviceEndAt:\s*canonicalEventState\.serviceEndAt/);
});
