import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalOrbitEventState } from "../features/operations/canonical-event-state-core.ts";

const event = (time: string) => ({
  id: "event-1",
  event_date: "2026-09-10",
  event_time: time,
  location: "Las Condes",
  city: "Santiago",
  project_services: [{ duration_hours: 4 }],
  project_operational_contracts: null,
});
const chileTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

test("canonical staff call is service start minus 90 minutes", () => {
  const state = buildCanonicalOrbitEventState(event("11:30"));
  assert.equal(chileTime(state.serviceStartAt), "11:30");
  assert.equal(chileTime(state.staffCallAt), "10:00");
  assert.equal(state.staffCallSource, "CANONICAL_MINUS_90");
});

test("founder manual override wins over the canonical projection", () => {
  const state = buildCanonicalOrbitEventState(event("12:30"), [{
    project_id: "event-1",
    staff_call_at: "2026-09-10T09:45:00.000Z",
    staff_call_source: "MANUAL_OVERRIDE",
    status: "CONFIRMED",
  }]);
  assert.equal(state.staffCallAt, "2026-09-10T09:45:00.000Z");
  assert.equal(state.staffCallSource, "MANUAL_OVERRIDE");
});

test("derived assignment projections do not become independent schedules", () => {
  const state = buildCanonicalOrbitEventState(event("22:00"), [{
    project_id: "event-1",
    staff_call_at: "2026-09-10T20:30:00.000Z",
    staff_call_source: "DERIVED",
    status: "ASSIGNED",
  }]);
  assert.equal(chileTime(state.staffCallAt), "20:30");
  assert.equal(state.staffCallSource, "CANONICAL_MINUS_90");
});
