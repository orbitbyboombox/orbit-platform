import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../features/founder-workspace/founder-workspace-experience.tsx", import.meta.url),
  "utf8",
);
const eventWorkspace = readFileSync(
  new URL("../features/projects/components/project-workspace-experience.tsx", import.meta.url),
  "utf8",
);
const eventCenter = readFileSync(
  new URL("../features/crm/event-center.tsx", import.meta.url),
  "utf8",
);
const blackBoxMaster = readFileSync(
  new URL("../features/resources/black-box-master.tsx", import.meta.url),
  "utf8",
);

test("dashboard keeps one actionable review center and removes the duplicated alert block", () => {
  assert.match(dashboard, /Pendientes por revisar/);
  assert.match(dashboard, /reviewCount/);
  assert.match(dashboard, /Aprobar|Rechazar/);
  assert.doesNotMatch(dashboard, /Alertas y pendientes/);
  assert.doesNotMatch(dashboard, /founder-alerts-title/);
});

test("Event 360 renders one active tab panel with independent tab state", () => {
  assert.match(eventWorkspace, /const \[eventTab, setEventTab\]/);
  assert.match(eventWorkspace, /id="event-tab-panel" role="tabpanel"/);
  assert.match(eventWorkspace, /aria-labelledby=\{`event-tab-\$\{eventTab\}-tab`\}/);
  for (const tab of ["summary", "finance", "staff", "operations", "documents", "communications"]) {
    assert.match(eventWorkspace, new RegExp(`eventTab === "${tab}"`));
  }
});

test("PR #56 recovery changes remain present", () => {
  assert.match(eventCenter, /new Date\(`\$\{event\.date\}T12:00:00Z`\)/);
  assert.match(blackBoxMaster, /boxes\.filter\(\(box\) => box\.status !== "OUT_OF_SERVICE"\)\.length/);
  assert.match(eventWorkspace, /PhotoStripDesignCenter documents=\{photoStripDocuments\}/);
});
