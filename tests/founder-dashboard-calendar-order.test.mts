import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const catalog = readFileSync(
  new URL("features/founder-workspace/catalog.ts", root),
  "utf8",
);
const repository = readFileSync(
  new URL("features/founder-workspace/repository.ts", root),
  "utf8",
);
const dashboard = readFileSync(
  new URL("features/founder-workspace/founder-workspace-experience.tsx", root),
  "utf8",
);

test("Calendar is first after the fixed Dashboard header by canonical default", () => {
  const dashboardCatalog = catalog.match(/DASHBOARD: \[[\s\S]*?\n  \],\n  CUSTOMERS:/)?.[0] ?? "";
  assert.match(dashboardCatalog, /DASHBOARD_HEADER[\s\S]*DASHBOARD_UPCOMING_EVENTS[\s\S]*DASHBOARD_WIDGETS/);
});

test("existing Founder layouts receive Calendar after the header without a reset", () => {
  assert.match(repository, /moduleKey === "DASHBOARD" && key === "DASHBOARD_UPCOMING_EVENTS"/);
  assert.match(repository, /headerIndex \+ 1/);
  assert.doesNotMatch(repository, /dashboard_layout\s*=\s*null|delete from founder_workspace_preferences/i);
});

test("Calendar uses the same persisted workspace ordering pipeline", () => {
  assert.match(dashboard, /workspace\.update/);
  assert.match(dashboard, /sectionOrder: order/);
  assert.match(dashboard, /DASHBOARD_UPCOMING_EVENTS/);
  assert.match(dashboard, /data-workspace-block.*data-workspace-key/);
  assert.match(dashboard, /avoidWorkspaceMenu/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage/);
});

test("Calendar extraction does not change Event or Calendar data logic", () => {
  assert.match(dashboard, /upcomingEvents\.slice\(0, 4\)/);
  assert.match(dashboard, /href="\/events"/);
  assert.doesNotMatch(dashboard, /href="\/projects\?view=calendar"/);
  assert.doesNotMatch(dashboard, /insert into|delete from|update projects|\.from\("projects"\)/i);
});
