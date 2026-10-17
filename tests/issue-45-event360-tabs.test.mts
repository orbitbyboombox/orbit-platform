import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../features/projects/components/project-workspace-experience.tsx", import.meta.url),
  "utf8",
);

test("Event 360 exposes six real tab controls", () => {
  assert.match(source, /const \[eventTab, setEventTab\]/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  for (const tab of ["summary", "finance", "staff", "operations", "documents", "communications"]) {
    assert.match(source, new RegExp(`id: "${tab}"`));
  }
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /selectEventTab\(id as EventTab\)/);
});

test("Event 360 does not rely on the legacy CSS visibility hack", () => {
  assert.doesNotMatch(source, /style jsx global/);
  assert.doesNotMatch(source, /event-mobile-panels/);
  assert.doesNotMatch(source, /mobileEventPanel/);
  assert.match(source, /eventTab === "summary"/);
  assert.match(source, /eventTab === "finance"/);
  assert.match(source, /eventTab === "staff"/);
  assert.match(source, /eventTab === "operations"/);
  assert.match(source, /eventTab === "documents"/);
  assert.match(source, /eventTab === "communications"/);
});

