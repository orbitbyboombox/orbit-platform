import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const boxes = readFileSync("app/(platform)/resources/boxes/page.tsx", "utf8");

test("Issue 68 keeps the compact pending-review indicator visible", () => {
  assert.match(dashboard, /data-fixed-founder-pending-review/);
  assert.match(dashboard, /Pendientes por revisar/);
  assert.match(dashboard, /reviewCount/);
  assert.doesNotMatch(dashboard, /reviewCount > 0 \? <div className="mb-4" data-fixed-founder-pending-review/);
});

test("Issue 68 preserves safe service editing and the six-tab isolation", () => {
  assert.match(workspace, /data-issue68-service-editor/);
  assert.match(workspace, /commercialLocked=/);
  assert.match(workspace, /eventTab === "summary"/);
  for (const tab of ["finance", "staff", "operations", "documents", "communications"]) {
    assert.match(workspace, new RegExp(`eventTab === "${tab}"`));
  }
});

test("Issue 68 provides responsive document and finance containers", () => {
  assert.match(workspace, /grid min-w-0 gap-4 xl:grid-cols-2/);
  assert.match(workspace, /id="event-finance"/);
  assert.match(workspace, /sm:grid-cols-2/);
});

test("Issue 68 exposes the existing payroll workspace from Staff", () => {
  assert.match(workspace, /\/resources\/staff\?payroll=1/);
  assert.match(workspace, /data-issue68-payroll-link/);
  assert.doesNotMatch(workspace, /save.*payment|insert.*payment/i);
});

test("Issue 68 exposes read-only warehouse stock from Cajas", () => {
  assert.match(boxes, /loadBoxes/);
  assert.match(boxes, /Ver inventario Bodega y movimientos/);
  assert.doesNotMatch(boxes, /insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

