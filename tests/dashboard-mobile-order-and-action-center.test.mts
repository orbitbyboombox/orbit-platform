import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dashboard upcoming events are sorted chronologically", () => {
  const source = readFileSync("app/(platform)/operations/page.tsx", "utf8");
  assert.match(source, /\.sort\(\(a, b\) => a\.date\.localeCompare\(b\.date\)/);
});

test("Founder action center is mandatory and visible", () => {
  const source = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");
  const catalog = readFileSync("features/founder-workspace/catalog.ts", "utf8");
  const repository = readFileSync("features/founder-workspace/repository.ts", "utf8");
  assert.match(source, /key: "DASHBOARD_ACTION_CENTER"[\s\S]*requiredVisible: true/);
  assert.match(catalog, /key: "DASHBOARD_ACTION_CENTER"[\s\S]*defaultVisible: true/);
  assert.match(repository, /key === "DASHBOARD_ACTION_CENTER"/);
  assert.match(repository, /DASHBOARD_QUICK_ACTIONS/);
});
