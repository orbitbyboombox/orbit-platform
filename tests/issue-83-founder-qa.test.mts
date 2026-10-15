import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const staffPage = readFileSync(`${root}/app/(platform)/resources/staff/page.tsx`, "utf8");
const workspaces = readFileSync(`${root}/features/resources/staff-workspaces.tsx`, "utf8");
const boxesPage = readFileSync(`${root}/app/(platform)/resources/boxes/page.tsx`, "utf8");
const boxMaster = readFileSync(`${root}/features/resources/black-box-master.tsx`, "utf8");

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
