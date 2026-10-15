import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveCanonicalStaffObligation } from "../features/staff-payments/canonical-staff-obligation.ts";
import { currentChileMonth, monthKeyForChile, monthLabel } from "../features/resources/box-history-date.ts";

const root = process.cwd();
const staffPage = readFileSync(`${root}/app/(platform)/resources/staff/page.tsx`, "utf8");
const workspaces = readFileSync(`${root}/features/resources/staff-workspaces.tsx`, "utf8");
const boxesPage = readFileSync(`${root}/app/(platform)/resources/boxes/page.tsx`, "utf8");
const boxMaster = readFileSync(`${root}/features/resources/black-box-master.tsx`, "utf8");
const warehouse = readFileSync(`${root}/features/resources/warehouse-inventory.tsx`, "utf8");
const boxInventory = readFileSync(`${root}/features/resources/box-inventory.ts`, "utf8");
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
  assert.match(boxesPage, /BlackBoxMaster/);
  assert.match(boxMaster, /WarehouseInventory/);
  assert.match(boxMaster, /STOCK BODEGA PAPEL|WarehouseInventory/);
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
  assert.match(boxMaster, /BoxPaperLoadPanel/);
  assert.match(boxMaster, /BoxMonthlyHistoryPanel/);
  assert.ok(boxMaster.indexOf("data-box-summary-grid") < boxMaster.indexOf("<WarehouseInventory"));
  assert.ok(boxMaster.indexOf("<WarehouseInventory") < boxMaster.indexOf("<BoxPaperLoadPanel"));
  assert.ok(boxMaster.indexOf("<BoxPaperLoadPanel") < boxMaster.indexOf("<BoxMonthlyHistoryPanel"));
  assert.match(warehouse, /data-issue87-stock-bodega-paper/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-paper-load-panel/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-monthly-history/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-load-selector="box"/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-history-selector="month"/);
  assert.match(read("features/resources/box-management-panel.tsx"), /data-box-paper-preview/);
  assert.match(read("features/resources/box-management-panel.tsx"), /CONFIRMAR CARGA · BLOQUEADA/);
});

test("Issue 91 keeps Caja 2 October history and Chile month options stable", () => {
  assert.equal(monthKeyForChile("2026-10-02"), "2026-10");
  assert.equal(monthKeyForChile("2026-09-18T00:00:00-04:00"), "2026-09");
  assert.equal(monthKeyForChile("02/10/2026"), "2026-10");
  assert.equal(currentChileMonth(new Date("2026-10-15T12:00:00Z")), "2026-10");
  assert.equal(monthLabel("2026-08"), "agosto de 2026");
  assert.equal(monthLabel("2026-09"), "septiembre de 2026");
  assert.equal(monthLabel("2026-10"), "octubre de 2026");
  const panel = read("features/resources/box-management-panel.tsx");
  assert.match(panel, /currentChileMonth\(\)/);
  assert.match(panel, /monthKeyForChile\(assignment\.eventDate\)/);
  assert.match(panel, /inMonth\(assignment\.eventDate, selectedMonth\)/);
});

test("Issue 92 separates active assignments from returned history", () => {
  assert.match(boxInventory, /assignment_status/);
  assert.match(boxInventory, /assignmentHistory/);
  assert.match(boxInventory, /assignmentStatus/);
  assert.match(boxInventory, /filter\(\(assignment\) => assignment\.assignmentStatus === "ASSIGNED"\)/);
  assert.doesNotMatch(boxInventory, /\.eq\("assignment_status", "ASSIGNED"\)/);
  const panel = read("features/resources/box-management-panel.tsx");
  assert.match(panel, /selectedBox\?\.assignmentHistory/);
  assert.match(panel, /assignmentStatusLabel/);
  assert.match(panel, /Caja \{blackBoxNumber\(selectedBox\.asset_code\)\}/);
});
