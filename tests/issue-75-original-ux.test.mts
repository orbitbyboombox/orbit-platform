import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documents = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const staffWorkspaces = readFileSync("features/resources/staff-workspaces.tsx", "utf8");
const staffPayments = readFileSync("features/staff-payments/staff-payments-center.tsx", "utf8");
const warehouse = readFileSync("features/resources/warehouse-inventory.tsx", "utf8");
const blackBoxes = readFileSync("features/resources/black-box-master.tsx", "utf8");
const transferPolicy = readFileSync("features/resources/paper-transfer-policy.ts", "utf8");

test("Issue 75 keeps Documents compact and horizontal on desktop without forcing mobile overflow", () => {
  assert.match(documents, /data-issue75-documents-grid/);
  assert.match(documents, /md:grid-cols-2/);
  assert.match(documents, /min-w-0/);
  assert.match(documents, /data-issue73-documents-designs/);
  assert.match(documents, /data-issue73-documents-commercial/);
});

test("Issue 75 exposes the real Staff payments flow globally", () => {
  assert.match(staffWorkspaces, /data-issue75-staff-quick-payments/);
  assert.match(staffWorkspaces, /setActive\("PAYROLL"\)/);
  assert.match(staffWorkspaces, /PAGOS POR PAGAR \/ ADELANTOS/);
  assert.match(staffPayments, /data-issue75-payment-sheet/);
  assert.match(staffPayments, /REGISTRAR PAGO/);
  assert.match(staffPayments, /ADJUNTAR COMPROBANTE DE PAGO/);
  assert.match(staffPayments, /registerMonthlyStaffPaymentAction/);
});

test("Issue 75 restores real warehouse paper summary and keeps transfer writes disabled", () => {
  assert.match(warehouse, /data-issue75-paper-summary/);
  assert.match(warehouse, /item\.unit === "PHOTO"/);
  assert.match(warehouse, /paperPrints \/ 700/);
  assert.match(warehouse, /Cargar papel a Caja/);
  assert.match(warehouse, /data-issue75-paper-transfer-action[\s\S]*disabled/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(transferPolicy, /INSUFFICIENT_SOURCE_STOCK/);
  assert.match(blackBoxes, /Cargar papel a Caja \{number\}/);
  assert.match(blackBoxes, /data-issue75-box-load-paper/);
});

test("Issue 75 preserves approved dashboard, finance and service-editor surfaces", () => {
  const dashboard = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");
  const serviceEditor = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
  assert.match(dashboard, /Pendientes por revisar/);
  assert.match(serviceEditor, /Editar servicio|Solicitar revisión|inline-service-editor/);
  assert.match(serviceEditor, /eventTab === "finance"/);
});
