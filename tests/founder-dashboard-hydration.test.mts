import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  "features/founder-workspace/founder-workspace-experience.tsx",
  "utf8",
);

test("Founder action timestamps use deterministic Chile date parts", () => {
  assert.match(dashboard, /const formatFounderActionTimestamp/);
  assert.match(dashboard, /timeZone: "America\/Santiago"/);
  assert.match(dashboard, /hourCycle: "h23"/);
  assert.match(dashboard, /formatFounderActionTimestamp\(item\.createdAt\)/);
});

test("Founder action SSR does not rely on locale punctuation", () => {
  assert.doesNotMatch(
    dashboard,
    /new Intl\.DateTimeFormat\("es-CL",\{dateStyle:"short",timeStyle:"short"/,
  );
  assert.doesNotMatch(dashboard, /suppressHydrationWarning/);
});
