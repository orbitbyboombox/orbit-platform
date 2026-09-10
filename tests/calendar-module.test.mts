import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("calendar is a canonical Events navigation sibling", () => {
  const navigation = read("components/layout/navigation.ts");
  const sidebar = read("components/layout/sidebar.tsx");
  assert.match(navigation, /key: "EVENTS"[\s\S]*key: "CALENDAR"/);
  assert.match(navigation, /href: "\/calendar"/);
  assert.match(sidebar, /key === "CALENDAR"/);
  assert.match(sidebar, /eventsPosition.*\+ 1/);
});

test("calendar renders month, week and day views from CRM operational events", () => {
  const page = read("app/(platform)/calendar/page.tsx");
  const calendar = read("features/crm/calendar.tsx");
  assert.match(page, /loadCrmOperationalEvents/);
  assert.match(calendar, /MONTH.*WEEK.*DAY/);
  assert.match(calendar, /Sin eventos programados para este período/);
  assert.match(calendar, /\/projects\/\$\{event\.projectId\}/);
  assert.match(calendar, /Filtrar servicio/);
  assert.match(calendar, /Filtrar estado/);
});
