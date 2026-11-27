import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");
const navigation = readFileSync("components/layout/navigation.ts", "utf8");
const dashboard = readFileSync(
  "features/founder-workspace/founder-workspace-experience.tsx",
  "utf8",
);
const catalog = readFileSync("features/founder-workspace/catalog.ts", "utf8");

test("main Calendar opens the dedicated route and Event shortcuts keep the Event center", () => {
  assert.match(sidebar, /navigationItems\.filter[\s\S]*href=\{href\}/);
  // b27ce334 introduced the dedicated Calendar sibling after the Event-center-only menu.
  assert.match(navigation, /key: "CALENDAR",\s*label: "Calendario",\s*href: "\/calendar"/);
  assert.match(navigation, /key: "EVENTS",\s*label: "Eventos",\s*href: "\/events"/);
  assert.match(dashboard, /href="\/events"[\s\S]*?Ver calendario/);
  assert.match(catalog, /key: "CALENDAR"[\s\S]*?href: "\/events"/);
});

test("legacy ignored calendar query is absent from current runtime navigation", () => {
  for (const source of [sidebar, navigation, dashboard, catalog]) {
    assert.doesNotMatch(source, /\/projects\?view=calendar/);
  }
});
