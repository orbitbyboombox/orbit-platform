import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const warehouse = readFileSync("features/resources/warehouse-inventory.tsx", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");

test("Issue 73 read-only paper inventory exposes stock, entries and movements", () => {
  assert.match(warehouse, /data-issue73-warehouse-stock/);
  assert.match(warehouse, /Historial de compras e ingresos documentados/);
  assert.match(warehouse, /Movimientos auditables/);
  assert.match(warehouse, /Transferencia aún no habilitada/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("Issue 73 improves documents desktop distribution and keeps Staff finance routes", () => {
  assert.match(workspace, /data-issue73-documents-layout/);
  assert.match(workspace, /data-issue73-documents-designs/);
  assert.match(workspace, /data-issue73-documents-commercial/);
  assert.match(workspace, /\@\[48rem\]:grid-cols-/);
  assert.match(workspace, /data-issue73-staff-finance-links/);
  assert.match(workspace, /href="\/finance\/payables"/);
  assert.match(workspace, /href="\/resources\/staff\?payroll=1"/);
});

