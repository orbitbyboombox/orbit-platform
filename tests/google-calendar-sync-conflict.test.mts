import test from "node:test";
import assert from "node:assert/strict";
import { hasRemoteCalendarConflict } from "../features/connectors/google-calendar/application/calendar-sync-conflict.ts";

test("detects a Google Calendar edit newer than the last ORBIT sync", () => {
  assert.equal(hasRemoteCalendarConflict("2026-11-17T10:00:00.000Z", "2026-11-17T10:00:01.000Z"), true);
});

test("allows an update when Google Calendar has no newer edit", () => {
  assert.equal(hasRemoteCalendarConflict("2026-11-17T10:00:01.000Z", "2026-11-17T10:00:00.000Z"), false);
  assert.equal(hasRemoteCalendarConflict("2026-11-17T10:00:00.000Z", "2026-11-17T10:00:00.000Z"), false);
});

test("fails closed when either timestamp is missing or invalid", () => {
  assert.equal(hasRemoteCalendarConflict(undefined, "2026-11-17T10:00:00.000Z"), true);
  assert.equal(hasRemoteCalendarConflict("bad", "2026-11-17T10:00:00.000Z"), true);
});
