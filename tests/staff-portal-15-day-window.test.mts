import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");

const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test("the Chile window is exactly 15 inclusive calendar dates", () => {
  const start = "2026-10-30";
  const end = shiftDate(start, 14);
  assert.equal(end, "2026-11-13");
  assert.equal(shiftDate(start, 15), "2026-11-14");
  assert.match(dashboard, /const next15DayRange/);
  assert.match(portal, /availabilityEnd=addDays\(start,14\)/);
});

test("the four reported November 7 events are inside the available window", () => {
  const start = "2026-10-30";
  const end = shiftDate(start, 14);
  const events = [
    ["ORB-2026-054223", "2026-11-07"],
    ["ORB-2026-378257", "2026-11-07"],
    ["ORB-2026-560272", "2026-11-07"],
    ["ORB-2026-474412", "2026-11-07"],
  ] as const;
  assert.deepEqual(events.filter(([, date]) => date >= start && date <= end).map(([id]) => id), events.map(([id]) => id));
  assert.match(dashboard, /EVENTOS DISPONIBLES · PRÓXIMOS 15 DÍAS/);
});
