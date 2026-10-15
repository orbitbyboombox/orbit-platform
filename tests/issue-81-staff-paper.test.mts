import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Issue 81 separates honoraria from paid staff expenses", () => {
  const page = read("app/(platform)/resources/staff/page.tsx");
  const center = read("features/staff-payments/staff-payments-center.tsx");
  const actions = read("features/staff-monthly-account/actions.ts");

  assert.match(page, /\.in\("status", \["CONFIRMED", "ESTIMATED"\]\)/);
  assert.match(page, /activeAssignmentIds/);
  assert.match(page, /honorariaOutstanding/);
  assert.match(page, /reimbursementPaidTotal/);
  assert.match(center, /event\.honorariaOutstanding/);
  assert.match(center, /Gastos pagados/);
  assert.match(actions, /reimbursements_total/);
  assert.match(actions, /current\.work_net/);
  assert.match(actions, /current\.reimbursements_total/);
});

test("Issue 81 renders a single read-only paper stock module with box balances", () => {
  const resources = read("app/(platform)/resources/page.tsx");
  const warehouse = read("features/resources/warehouse-inventory.tsx");

  assert.match(resources, /loadBoxes\(client\)/);
  assert.match(resources, /boxes=\{boxes\}/);
  assert.match(warehouse, /STOCK BODEGA PAPEL/);
  assert.match(warehouse, /rollos completos de 700/);
  assert.match(warehouse, /data-issue81-box-balances/);
  assert.match(warehouse, /Transferencia aún no habilitada/);
  assert.match(warehouse, /disabled/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
