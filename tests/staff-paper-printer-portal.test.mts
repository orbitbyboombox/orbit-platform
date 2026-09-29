import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const boxPanel = readFileSync("features/portal-authentication/staff-box-operations-panel.tsx", "utf8");
const actions = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");

test("Staff Portal exposes the compact printer-paper module and collapsed requests accordion", () => {
  assert.match(dashboard, /PAPEL IMPRESORA/);
  assert.match(dashboard, /data-staff-paper-module/);
  assert.match(dashboard, /data-requests-accordion/);
  assert.match(dashboard, /useState\(false\)/);
});

test("printer-paper module reuses the canonical snapshot closeout path", () => {
  assert.match(dashboard, /<StaffBoxOperationsPanel projectId=\{event\.id\} paperOnly \/>/);
  assert.match(boxPanel, /paperOnly\?/);
  assert.match(boxPanel, /OperatorPaperCloseout/);
  assert.match(actions, /confirm_staff_event_paper_closeout/);
  assert.match(actions, /event_paper_snapshots/);
  assert.match(actions, /event_paper_reloads/);
});

test("paper values stay expressed as photos without client-side conversion", () => {
  assert.match(boxPanel, /openingBalance\} fotos/);
  assert.match(boxPanel, /finalRemaining.*fotos/);
  assert.match(boxPanel, /eventUsage.*fotos/);
});
