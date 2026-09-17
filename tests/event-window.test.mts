import test from "node:test";
import assert from "node:assert/strict";
import { BookingTimeInvalidError, normalizeEventWindow, zonedLocalDateTimeToDate } from "../features/time-intelligence/event-window.ts";

test("normalizes the automatic booking regression case in America/Santiago", () => {
  const window = normalizeEventWindow({ eventDate: "2027-03-04", serviceStart: "17:30", durationHours: 3 });
  assert.equal(window.startAt, "2027-03-04T20:30:00.000Z");
  assert.equal(window.endAt, "2027-03-04T23:30:00.000Z");
});

test("handles standard times, midnight and crossing midnight", () => {
  assert.equal(normalizeEventWindow({ eventDate: "2027-03-04", serviceStart: "18:00", durationHours: 3 }).endAt, "2027-03-05T00:00:00.000Z");
  assert.equal(normalizeEventWindow({ eventDate: "2027-03-04", serviceStart: "20:00", durationHours: 3 }).endAt, "2027-03-05T02:00:00.000Z");
  assert.equal(normalizeEventWindow({ eventDate: "2027-03-04", serviceStart: "23:30", durationHours: 2 }).endAt, "2027-03-05T04:30:00.000Z");
});

test("resolves Chile summer and winter offsets through IANA timezone rules", () => {
  const summer = zonedLocalDateTimeToDate("2027-01-15", "12:00");
  const winter = zonedLocalDateTimeToDate("2027-07-15", "12:00");
  assert.equal(summer.toISOString(), "2027-01-15T15:00:00.000Z");
  assert.equal(winter.toISOString(), "2027-07-15T16:00:00.000Z");
});

test("rejects invalid dates, clocks and durations with BOOKING_TIME_INVALID", () => {
  for (const input of [
    { eventDate: "2027-02-30", serviceStart: "17:30", durationHours: 3 },
    { eventDate: "2027-03-04", serviceStart: "25:00", durationHours: 3 },
    { eventDate: "2027-03-04", serviceStart: "17:30", durationHours: 0 },
  ]) assert.throws(() => normalizeEventWindow(input), (error: unknown) => error instanceof BookingTimeInvalidError && error.code === "BOOKING_TIME_INVALID");
});
