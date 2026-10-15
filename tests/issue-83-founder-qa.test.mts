import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveCanonicalStaffObligation } from "../features/staff-payments/canonical-staff-obligation.ts";

const root = process.cwd();
const staffPage = readFileSync(`${root}/app/(platform)/resources/staff/page.tsx`, "utf8");
const workspaces = readFileSync(`${root}/features/resources/staff-workspaces.tsx`, "utf8");
const boxesPage = readFileSync(`${root}/app/(platform)/resources/boxes/page.tsx`, "utf8");
const boxMaster = readFileSync(`${root}/features/resources/black-box-master.tsx`, "utf8");
const warehouse = readFileSync(`${root}/features/resources/warehouse-inventory.tsx`, "utf8");
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

test("Issue 83 includes CONFIRMED assignments in canonical staff payment obligations", () => {
  assert.match(staffPage, /ASSIGNED.*ACCEPTED.*COMPLETED.*CONFIRMED/);
  assert.match(staffPage, /honorariaOutstanding/);
  assert.match(staffPage, /reimbursementPaidTotal/);
});

test("Issue 83 exposes a direct Logistics workspace without changing payment writes", () => {
  assert.match(workspaces, /label: "Logística"/);
  assert.match(workspaces, /data-issue83-staff-logistics/);
  assert.match(workspaces, /setActive\("OPERATIONS"\)/);
  assert.doesNotMatch(workspaces, /update|insert|upsert|delete/);
});

test("Issue 83 mounts STOCK BODEGA PAPEL on the main Cajas page", () => {
  assert.match(boxesPage, /WarehouseInventory/);
  assert.match(boxesPage, /STOCK BODEGA PAPEL|WarehouseInventory/);
  assert.match(boxesPage, /loadBoxes/);
});

test("Issue 83 keeps paper transfer blocked and cards free of duplicated warehouse panels", () => {
  assert.match(boxMaster, /physicalStock/);
  assert.match(boxMaster, /Saldo físico fiable/);
  assert.doesNotMatch(boxMaster, /Abrir Bodega y movimientos/);
  assert.doesNotMatch(boxMaster, /CONFIRMAR TRANSFERENCIA|transferPaper|loadPaperAction/);
});

test("Issue 85 uses total_internal_payment for single-role obligations", () => {
  assert.deepEqual(deriveCanonicalStaffObligation({ tasks: ["ASSEMBLY"], totalInternalPayment: 10000, operator: 0, assembly: 7000, disassembly: 0 }), { operator: 0, assembly: 10000, disassembly: 0, total: 10000 });
  assert.deepEqual(deriveCanonicalStaffObligation({ tasks: ["DISASSEMBLY"], totalInternalPayment: 10000, operator: 0, assembly: 0, disassembly: 0 }), { operator: 0, assembly: 0, disassembly: 10000, total: 10000 });
  assert.equal(deriveCanonicalStaffObligation({ tasks: ["OPERATOR"], totalInternalPayment: 14000, operator: 14000, assembly: 0, disassembly: 0 }).total, 14000);
});

test("Issue 85 preserves direct Logistics and compact paper inventory access", () => {
  assert.match(workspaces, /data-issue83-staff-logistics/);
  assert.match(warehouse, /ASIGNAR CAJA A EVENTO/);
  assert.match(boxMaster, /Fotos disponibles|Saldo físico fiable/);
});

test("Issue 87 restores legacy operational photo stock without treating it as physical inventory", () => {
  assert.match(warehouse, /blackBoxStock\(box\.metadata\)/);
  assert.match(warehouse, /Fotos disponibles/);
  assert.match(warehouse, /Lotes físicos: pendiente de conciliación/);
  assert.match(warehouse, /STOCK BODEGA PAPEL/);
  assert.match(warehouse, /data-issue87-stock-bodega-paper/);
  assert.match(boxMaster, /blackBoxStock\(box\.metadata\)/);
  assert.doesNotMatch(warehouse, /Saldo no conciliado/);
});

test("Issue 89 keeps Cajas as two compact areas and folds technical detail", () => {
  assert.match(warehouse, /data-issue87-stock-bodega-paper/);
  assert.match(warehouse, /Fotografías disponibles en Bodega/);
  assert.match(warehouse, /Rollos equivalentes/);
  assert.match(boxMaster, /Ver detalle/);
  assert.match(boxMaster, /Fotos disponibles/);
  assert.match(boxMaster, /defaultValue=\{blackBoxStock\(box\.metadata\)\}/);
  assert.doesNotMatch(boxMaster, /Saldo no conciliado/);
  assert.doesNotMatch(boxMaster, /RPC\/RLS/);
});

test("Issue 90 separates box consultation from blocked paper management", () => {
  assert.match(boxMaster, /data-box-summary-grid/);
  assert.match(boxMaster, /BoxManagementPanel/);
  assert.match(boxMaster, /movements/);
  assert.match(warehouse, /data-issue87-stock-bodega-paper/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-management-panel/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-management-selector="box"/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-management-selector="month"/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-paper-preview/);
  assert.match(read("features/resources/box-management-panel.tsx"), /CONFIRMAR CARGA · BLOQUEADA/);
});
