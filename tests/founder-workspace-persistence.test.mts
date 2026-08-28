import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboardActions = readFileSync(
  new URL("features/founder-workspace/dashboard-layout.actions.ts", root),
  "utf8",
);
const workspaceActions = readFileSync(
  new URL("features/founder-workspace/actions.ts", root),
  "utf8",
);

test("founder dashboard layout persistence writes directly to the shared preferences row", () => {
  assert.match(dashboardActions, /from\("founder_workspace_preferences"\)\.upsert/);
  assert.doesNotMatch(dashboardActions, /rpc\("save_founder_dashboard_layout"|rpc\("reset_founder_dashboard_layout"/);
});

test("personal workspace persistence writes directly to the shared preferences row", () => {
  assert.match(workspaceActions, /from\("founder_workspace_preferences"\)\.upsert/);
  assert.doesNotMatch(workspaceActions, /rpc\("save_founder_workspace"|rpc\("reset_founder_workspace"/);
});
