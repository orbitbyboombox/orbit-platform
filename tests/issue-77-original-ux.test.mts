import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documents = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const staff = readFileSync("features/staff-payments/staff-payments-center.tsx", "utf8");
const warehouse = readFileSync("features/resources/warehouse-inventory.tsx", "utf8");

test("Issue 77 gives Documents the full desktop row and preserves mobile containment", () => {
  assert.match(documents, /className="min-w-0 xl:col-span-2"/);
  assert.match(documents, /data-issue75-documents-grid/);
  assert.match(documents, /md:grid-cols-2/);
  assert.match(documents, /min-w-0/);
});

test("Issue 77 restores the original operator to event payment quick flow", () => {
  assert.match(staff, /data-issue77-quick-staff-payment/);
  assert.match(staff, /Seleccionar operador/);
  assert.match(staff, /Evento pendiente/);
  assert.match(staff, /OK \/ PAGAR Y REGISTRAR COMPROBANTE/);
  assert.match(staff, /registerMonthlyStaffPaymentAction/);
  assert.match(staff, /name="file" required/);
});

test("Issue 77 keeps the paper transfer prepared but write-disabled", () => {
  assert.match(warehouse, /INVENTARIO PAPEL/);
  assert.match(warehouse, /paperPrints \/ 700/);
  assert.match(warehouse, /data-issue77-paper-transfer/);
  assert.match(warehouse, /data-issue77-paper-transfer-action[\s\S]*disabled/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
