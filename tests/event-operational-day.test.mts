import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync("features/crm/events-repository.ts", "utf8");
const eventCenter = readFileSync("features/crm/event-center.tsx", "utf8");
const calendar = readFileSync("features/crm/calendar.tsx", "utf8");

test("operational day is the staff call date, while displayed service time stays canonical", () => {
  assert.match(repository, /date:staffCall\.date,time:serviceStart\.time/);
  assert.match(repository, /serviceStartAt:\x60\$\{serviceStart\.date\}T\$\{serviceStart\.time\}\x60/);
  assert.match(repository, /staffCallAt:\x60\$\{staffCall\.date\}T\$\{staffCall\.time\}\x60/);
});

test("editing keeps service date, not the operational day", () => {
  assert.match(eventCenter, /const operationalDate = event\.serviceStartAt\?\.slice\(0, 10\)/);
  assert.match(eventCenter, /const canonicalDate = operationalDate/);
});

test("calendar and completed events sort by citation time", () => {
  assert.match(calendar, /a\.staffCallAt/);
  assert.match(eventCenter, /new Date\(a\.staffCallAt/);
});
