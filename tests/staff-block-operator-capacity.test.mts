import test from "node:test";
import assert from "node:assert/strict";
import { canAssignBlockStaff } from "../features/staff-assignment-center/staff-role-slots.ts";

test("cada bloque admite asignaciones independientes hasta su capacidad", () => {
  for (let assigned = 0; assigned < 7; assigned += 1) {
    assert.equal(canAssignBlockStaff(assigned, 7), true, `${assigned}/7 debe permitir agregar`);
  }
  assert.equal(canAssignBlockStaff(7, 7), false, "7/7 debe bloquear la octava asignación");
  assert.equal(canAssignBlockStaff(2, 0), false, "sin capacidad configurada no se asigna");
});
