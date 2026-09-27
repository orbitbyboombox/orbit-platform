import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");

test("Staff Portal exposes exactly three top-level modules", () => {
  assert.match(dashboard, /type StaffModule = "OPERADORES" \| "MONTAJE" \| "FINANZAS"/);
  assert.match(dashboard, /data-staff-home-modules="3"/);
  for (const moduleName of ["OPERADORES", "MONTAJE", "FINANZAS"]) {
    assert.ok(dashboard.includes(`["${moduleName}"`));
    assert.match(dashboard, new RegExp(`data-staff-module-view="${moduleName}"`));
  }
});

test("Staff capabilities remain nested in their owning module", () => {
  assert.match(dashboard, /<AvailableEvents events=\{weeklyAvailableEvents\}/);
  assert.match(dashboard, /<StaffRoutesPanel routes=\{routes\}/);
  assert.match(dashboard, /<StaffExpenseSubmissionPanel events=\{events\}/);
  assert.match(dashboard, /<StaffMonthlyAccountPanel account=\{account\}/);
  assert.match(dashboard, /<EventDetail event=\{selected\}/);
  assert.match(dashboard, /SUBE TU GASTO/);
  assert.doesNotMatch(dashboard, /data-staff-module="(RUTAS|CHECKLIST|CAJA|PAPEL|PAGOS|GASTOS)"/);
});
