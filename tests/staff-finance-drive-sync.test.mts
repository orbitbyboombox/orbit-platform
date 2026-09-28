import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const service = readFileSync("features/connectors/google-drive/application/staff-finance-document-sync.service.ts", "utf8");
const route = readFileSync("app/api/integrations/google-drive/staff-finance/route.ts", "utf8");

test("staff finance Drive sync keeps the three canonical document chains separate", () => {
  assert.match(service, /staff_expense_submissions/);
  assert.match(service, /staff_reimbursement_payments/);
  assert.match(service, /event_staff_settlement_movements/);
  assert.match(service, /GASTO_ORIGINAL_/);
  assert.match(service, /REEMBOLSO_PAGADO_/);
  assert.match(service, /PAGO_/);
  assert.match(service, /drive_file_id/);
  assert.match(service, /findFileByName/);
});

test("staff finance Drive sync uses deterministic staff/year/month folders", () => {
  assert.match(service, /\["STAFF", staffName, year, month, "04_REEMBOLSOS"/);
  assert.match(service, /03_COMPROBANTES_PAGO/);
  assert.match(service, /STAFF_PAYMENT_RECEIPT/);
  assert.match(route, /getGoogleWorkspaceAdministrator/);
});
