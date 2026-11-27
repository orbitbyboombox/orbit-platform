import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  "features/founder-workspace/founder-workspace-experience.tsx",
  "utf8",
);

test("Founder dashboard renders civil event dates without host time or punctuation differences", () => {
  assert.match(dashboard, /function formatUpcomingEventDate/);
  assert.match(dashboard, /new Date\(`\$\{value\}T12:00:00Z`\)/);
  assert.match(dashboard, /timeZone: "UTC"/);
  assert.match(dashboard, /formatToParts\(date\)/);
  assert.match(dashboard, /formatUpcomingEventDate\(event\.date\)/);
});

test("Founder action SSR does not rely on locale punctuation", () => {
  assert.doesNotMatch(
    dashboard,
    /new Intl\.DateTimeFormat\("es-CL",\{dateStyle:"short",timeStyle:"short"/,
  );
  assert.doesNotMatch(dashboard, /suppressHydrationWarning/);
});
