import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expected = [
  "COMMERCIAL",
  "HOME",
  "CALENDAR",
  "EVENTS",
  "CUSTOMERS",
  "STAFF",
  "RESOURCES",
  "BOXES",
  "FINANCE",
  "RECEIVABLES",
  "COLLECTIONS",
  "PAYABLES",
  "OFFICE_RENT",
  "REPORTS",
  "SETTINGS",
] as const;
const navigation = readFileSync(new URL("../components/layout/navigation.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/layout/sidebar.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../features/founder-workspace/catalog.ts", import.meta.url), "utf8");

test("desktop and mobile share the requested main menu order", () => {
  const navigationKeys = [...navigation.matchAll(/key: "([A-Z_]+)"/g)].map((match) => match[1]);
  const workspaceBlock = workspace.match(/navigationOrder: \[([\s\S]*?)\],\n\s+hiddenNavigation/);
  const workspaceKeys = [...(workspaceBlock?.[1] ?? "").matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(navigationKeys, expected);
  assert.deepEqual(workspaceKeys, expected);
  assert.match(sidebar, /navigationItems\.filter/);
  assert.doesNotMatch(sidebar, /navigationItems\].sort/);
  assert.equal(new Set(expected).size, expected.length);
});
