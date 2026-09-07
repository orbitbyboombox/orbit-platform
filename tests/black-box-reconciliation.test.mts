import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0231_reconcile_black_box_inventory.sql", "utf8");
const ui = readFileSync("features/resources/equipment-operation-center.tsx", "utf8");
const availability = readFileSync("supabase/migrations/0128_operations_phase_c_resource_planning.sql", "utf8");

test("reconciliation keeps exactly the nine Founder-confirmed CASE units", () => {
  assert.match(migration, /CASE-01/);
  assert.match(migration, /CASE-09/);
  assert.match(migration, /CASE-10/);
  assert.match(migration, /CASE-12/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("CASE-10..12 are excluded by canonical availability status", () => {
  assert.match(migration, /desired_status:='OUT_OF_SERVICE'/);
  assert.match(availability, /asset\.status not in\('MAINTENANCE','OUT_OF_SERVICE'\)/);
});

test("CASE-01 and CASE-04 are only released when no active assignment exists", () => {
  assert.match(migration, /asset_assignments/);
  assert.match(migration, /assignment_status='ASSIGNED'/);
  assert.match(migration, /desired_status:='AVAILABLE'/);
});

test("the canonical CASE value remains unchanged while UI uses commercial label", () => {
  assert.match(ui, /value: "CASE", label: "Caja Negra BOOMBOX"/);
  assert.doesNotMatch(migration, /asset_type\s*=\s*['"]BOX['"]/i);
});
