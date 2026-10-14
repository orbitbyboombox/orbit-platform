import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payables = readFileSync("features/accounts-payable/accounts-payable-center.tsx", "utf8");
const staff = readFileSync("app/(platform)/resources/staff/page.tsx", "utf8");
const workspaces = readFileSync("features/resources/staff-workspaces.tsx", "utf8");
const monthly = readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx", "utf8");

test("Accounts payable exposes a link to existing advances without directly changing payments", () => {
  assert.match(payables, /Ver adelantos de pago/);
  assert.match(payables, /href="\/resources\/staff\?payroll=1"/);
  assert.doesNotMatch(payables, /registerStaffAdvanceAction|registerMonthlyStaffPaymentAction/);
});
test("Staff link selects the existing payroll workspace", () => {
  assert.match(staff, /payroll\?:string/);
  assert.match(staff, /payroll === "1" \? "PAYROLL"/);
  assert.match(workspaces, /initialWorkspace \?\? "TEAM"/);
});
test("Staff advance registration and history are kept in the existing module", () => {
  assert.match(monthly, /registerStaffAdvanceAction/);
  assert.match(monthly, /REGISTRAR ADELANTO/);
  assert.match(monthly, /Adelantos realizados/);
});
