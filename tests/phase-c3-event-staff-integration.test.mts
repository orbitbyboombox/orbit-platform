import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260925120000_phase_c3_event_staff_integration.sql", "utf8");
const staffAction = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");
const staffPanel = readFileSync("features/portal-authentication/staff-box-operations-panel.tsx", "utf8");
const adminPanel = readFileSync("features/asset-management/event-box-operations-panel.tsx", "utf8");
const assignmentPanel = readFileSync("features/asset-management/equipment-assignment-panel.tsx", "utf8");
const boxPage = readFileSync("app/(platform)/resources/boxes/[assetId]/page.tsx", "utf8");

test("C.3 keeps canonical Box assignment and overlap boundaries", () => {
  assert.match(assignmentPanel, /ASIGNAR CAJA/);
  assert.match(migration, /asset_assignments/);
  assert.match(migration, /record_staff_box_check_out/);
  assert.match(migration, /record_staff_box_check_in/);
});

test("Staff checkout/checkin is authenticated, role-scoped and idempotent", () => {
  assert.match(staffAction, /loadPortalSession\("STAFF"\)/);
  assert.match(staffAction, /OPERATOR.*ASSEMBLY/);
  assert.match(staffAction, /OPERATOR.*DISASSEMBLY/);
  assert.match(staffAction, /staff-box-checkout/);
  assert.match(staffAction, /staff-box-checkin/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /on conflict/);
  assert.match(staffPanel, /CHECK_OUT/);
  assert.match(staffPanel, /CHECK_IN/);
});

test("C.3 records checklist, usage, incident and review status", () => {
  for (const value of ["OK", "MISSING", "DAMAGED", "MAINTENANCE_REQUIRED"]) assert.match(migration, new RegExp(value));
  assert.match(migration, /EVENT_USAGE/);
  assert.match(migration, /event_incidents/);
  assert.match(migration, /REQUIRES_REVIEW/);
  assert.match(adminPanel, /CHECK_OUT/);
  assert.match(adminPanel, /CHECK_IN/);
  assert.match(boxPage, /quantity_before/);
  assert.match(boxPage, /quantity_after/);
});

test("C.3 does not expose Staff inventory-admin controls", () => {
  assert.doesNotMatch(staffPanel, /MANUAL_ADJUSTMENT|DISCARD|Cargar medio|Asignar Caja/);
  assert.match(migration, /revoke all on function public\.record_staff_box_check/);
});
