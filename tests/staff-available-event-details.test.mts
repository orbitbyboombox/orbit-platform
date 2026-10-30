import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");

test("available Staff cards expose operational details before requesting a role", () => {
  for (const label of ["Recinto", "Dirección", "Horario", "Hora de citación", "Caja asignada", "Responsabilidades", "Honorarios"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /TOMAR RESPONSABILIDAD · Ver detalle/);
  assert.match(dashboard, /event\.callout/);
  assert.match(dashboard, /event\.box/);
});

test("available details are read from canonical operational records and official rates", () => {
  assert.match(portal, /from\("projects"\)\.select\("id,location,city,operations/);
  assert.match(portal, /from\("asset_assignments"\)/);
  assert.match(portal, /from\("event_staff_requirements"\)\.select\("project_id,block_id,role/);
  assert.match(portal, /interpolateOperatorRate/);
  assert.match(portal, /America\/Santiago/);
});

test("unknown honoraria are not silently represented as a calculated zero", () => {
  assert.match(dashboard, /Honorario pendiente de definir/);
  assert.match(portal, /officialRate/);
  assert.match(portal, /payments:\{operator:operatorRate,assembly:assemblyRate,disassembly:disassemblyRate,combined:combinedRate,transportationBonus:null\}/);
});

test("available event honoraria are isolated from commercial quote totals", () => {
  const availableSection = portal.slice(portal.indexOf("const availableEvents"));
  assert.doesNotMatch(availableSection, /quotation_total|grand_total|final_customer_price|transport_total/);
  assert.match(portal, /const officialRates=new Map\(\(costMasterResult\.data/);
  assert.match(availableSection, /interpolateOperatorRate/);
  assert.match(dashboard, /Este monto corresponde exclusivamente a tu responsabilidad/);
});

test("free events still render official Staff honoraria and not client pricing", () => {
  assert.match(dashboard, /Honorarios:/);
  assert.match(dashboard, /TUS CARGOS Y HONORARIOS/);
  assert.match(dashboard, /Honorario oficial de la asignación/);
  assert.match(dashboard, /Honorario pendiente de definir/);
});
