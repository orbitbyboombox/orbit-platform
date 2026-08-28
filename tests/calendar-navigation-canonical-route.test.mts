import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("components/layout/sidebar.tsx", "utf8");
const dashboard = readFileSync(
  "features/founder-workspace/founder-workspace-experience.tsx",
  "utf8",
);
const catalog = readFileSync("features/founder-workspace/catalog.ts", "utf8");

test("every Founder calendar entry opens the canonical Event center", () => {
  assert.match(sidebar, /label:"Calendario",href:"\/events"/);
  assert.match(dashboard, /href="\/events">Ver calendario/);
  assert.match(catalog, /key: "CALENDAR"[\s\S]*?href: "\/events"/);
});

test("legacy ignored calendar query is absent from current runtime navigation", () => {
  for (const source of [sidebar, dashboard, catalog]) {
    assert.doesNotMatch(source, /\/projects\?view=calendar/);
  }
});
