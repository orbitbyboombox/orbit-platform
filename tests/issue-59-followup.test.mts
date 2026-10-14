import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const resourcesPage = readFileSync("app/(platform)/resources/page.tsx", "utf8");
const warehouse = readFileSync("features/resources/warehouse-inventory.tsx", "utf8");
const serviceEditor = readFileSync("features/projects/components/inline-service-editor.tsx", "utf8");
const serviceAction = readFileSync("features/projects/actions/service-change.actions.ts", "utf8");

test("Issue #59 keeps Staff block editing and exposes Logística without duplicating the assignment model", () => {
  assert.match(workspace, /StaffAssignmentCenter \{\.\.\.event\.staffAssignments\}/);
  assert.match(workspace, /Abrir Logística/);
  assert.match(workspace, /selectEventTab\("operations"\)/);
  assert.match(workspace, /eventTab === "operations"/);
});

test("Issue #59 distinguishes estimated reference costs from the canonical real-cost read model", () => {
  assert.match(workspace, /Costos estimados \(referencia\)/);
  assert.match(workspace, /financial_event_records/);
  assert.match(workspace, /event\.profit\.costs\.totalOperationalCost/);
});

test("Issue #59 warehouse view is read-only and uses the existing inventory ledger", () => {
  assert.match(resourcesPage, /from\("supplies"\)/);
  assert.match(resourcesPage, /from\("inventory_movements"\)/);
  assert.match(resourcesPage, /WarehouseInventory/);
  assert.doesNotMatch(warehouse, /createResourceAction|registerMovement|updateResourceAction|deleteResourceAction/);
});

test("Issue #59 preserves the financial/legal guards on service editing", () => {
  assert.match(serviceEditor, /commercialLocked/);
  assert.match(serviceEditor, /cotización formal/);
  assert.match(serviceAction, /DRAFT.*CANCELLED.*REJECTED/);
  assert.match(serviceAction, /receivables/);
  assert.match(serviceAction, /paid_amount/);
});

