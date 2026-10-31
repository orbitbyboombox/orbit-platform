import test from "node:test";
import assert from "node:assert/strict";
import { canAssignBlockStaff } from "../features/staff-assignment-center/staff-role-slots.ts";

test("Founder/Admin puede corregir asignaciones más allá de la capacidad orientativa", () => {
  for (let assigned = 0; assigned < 7; assigned += 1) {
    assert.equal(canAssignBlockStaff(assigned, 7), true, `${assigned}/7 debe permitir agregar`);
  }
  assert.equal(canAssignBlockStaff(7, 7), true, "la capacidad orienta pero no bloquea al administrador");
  assert.equal(canAssignBlockStaff(2, 0), true, "una capacidad no configurada no bloquea al administrador");
});
