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

test("Staff Home reuses compact weekly and logistics language", () => {
  for (const marker of ["MI SEMANA", "Tu agenda semanal", "EVENTOS DISPONIBLES ESTA SEMANA", "SEMANA ACTUAL", "RUTA OFICIAL", "MONTAJE", "DESMONTAJE"]) {
    assert.match(dashboard, new RegExp(marker));
  }
  assert.match(dashboard, /grid-cols-\[52px_4px_minmax\(0,1fr\)_auto\]/);
  assert.match(dashboard, /No tienes eventos asignados esta semana/);
});

test("Staff Home places the weekly agenda before summary and modules", () => {
  const agenda = dashboard.indexOf("<StaffWeeklyEventList events={events} />");
  const summary = dashboard.indexOf("Resumen rápido");
  const modules = dashboard.indexOf('data-staff-module={key}');
  assert.ok(agenda >= 0, "weekly agenda should render on Staff Home");
  assert.ok(summary >= 0 && modules >= 0, "summary and modules should render on Staff Home");
  assert.ok(agenda < summary, "weekly agenda must precede summary");
  assert.ok(agenda < modules, "weekly agenda must precede modules");
});

test("Staff Portal keeps finance and capability visibility structural", () => {
  assert.match(dashboard, /capabilities: string\[\]/);
  assert.match(dashboard, /canMount = capabilities\.includes\("ASSEMBLY"\)/);
  assert.match(dashboard, /events=\{weekEvents\}/);
  assert.match(dashboard, /currentMonth=\{currentMonth\}/);
  assert.match(dashboard, /notificationsOpen/);
  assert.match(dashboard, /staffMonthLabel/);
});
