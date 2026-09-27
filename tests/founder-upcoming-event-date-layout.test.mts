import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const view = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");

test("upcoming event date remains a compact left column beside event content", () => {
  assert.match(view, /grid-cols-\[4rem_minmax\(0,1fr\)_auto\].*items-center/);
  assert.match(view, /h-\[4\.25rem\].*w-16/);
  assert.match(view, /sm:grid-cols-\[4\.5rem_minmax\(0,1fr\)_auto\]/);
  assert.match(view, /formattedDate\.weekday/);
  assert.match(view, /formattedDate\.day/);
  assert.match(view, /formattedDate\.month/);
  assert.match(view, /event\.title/);
  assert.match(view, /event\.service/);
  assert.match(view, /event\.location/);
  assert.match(view, /event\.status/);
});
