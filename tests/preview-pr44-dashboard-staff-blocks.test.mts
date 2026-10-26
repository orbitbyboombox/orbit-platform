import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboard = readFileSync(new URL("features/founder-workspace/founder-workspace-experience.tsx", root), "utf8");
const staff = readFileSync(new URL("features/staff-assignment-center/staff-assignment-center.tsx", root), "utf8");
const actions = readFileSync(new URL("features/operations/operations-planning.actions.ts", root), "utf8");

test("Pendientes por revisar only counts approval and staff expense queues", () => {
  assert.match(dashboard, /STAFF_EXPENSE_REVIEW_REQUIRED/);
  assert.match(dashboard, /STAFF_BOLETA_REVIEW_REQUIRED/);
  assert.match(dashboard, /reviewCount = reviewActions.length \+ staffApprovalItems.length/);
  assert.match(dashboard, /No hay gastos, boletas o solicitudes de asignación pendientes/);
});

test("staff blocks are rendered even when the event has no blocks", () => {
  assert.match(staff, /Bloques de Staff/);
  assert.match(staff, /Crear bloque/);
  assert.match(staff, /Editar bloque/);
  assert.match(staff, /Añadir Staff/);
  assert.match(staff, /Este evento todavía no tiene bloques/);
  assert.match(staff, /blocks = \[\]/);
});

test("block mutations use the authenticated administrative action layer", () => {
  assert.match(actions, /createEventOperationalBlockAction/);
  assert.match(actions, /updateEventOperationalBlockAction/);
  assert.match(actions, /await context\(\)/);
  assert.match(actions, /set_event_staff_requirement/);
});
