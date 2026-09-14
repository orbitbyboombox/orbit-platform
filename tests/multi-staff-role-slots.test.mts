import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStaffRoleSlots, validStaffQuantity } from "../features/staff-assignment-center/staff-role-slots.ts";
import { buildResponsibilityReadModel } from "../features/staff-assignment-center/staff-responsibility-read-model.ts";

const ui = readFileSync("features/staff-assignment-center/staff-assignment-center.tsx", "utf8");
const sql = readFileSync("supabase/migrations/20260914150059_multi_staff_role_slots.sql", "utf8");
const actions = readFileSync("features/staff-assignment-center/actions.ts", "utf8");
const assigned = (count: number, role = "OPERATOR") => Array.from({ length: count }, (_, index) => ({
  id: `assignment-${String(index).padStart(2, "0")}`, staffId: `staff-${index}`, staffName: `Staff ${index}`, role, status: "CONFIRMED",
}));

for (const count of [1, 2, 5, 12]) {
  test(`${count} operators produce ${count} independently assignable slots`, () => {
    const empty = buildStaffRoleSlots("OPERATOR", count, []);
    assert.equal(empty.length, count);
    assert.deepEqual(empty.map((slot) => slot.number), Array.from({ length: count }, (_, i) => i + 1));
    assert.ok(empty.every((slot) => slot.assignment === null));
    const full = buildStaffRoleSlots("OPERATOR", count, assigned(count));
    assert.equal(new Set(full.map((slot) => slot.assignment?.id)).size, count);
    assert.equal(full.filter((slot) => slot.assignment).length, count);
  });
}

test("one operator out of two leaves exactly one vacancy", () => {
  const slots = buildStaffRoleSlots("OPERATOR", 2, assigned(1));
  assert.equal(slots.filter((slot) => slot.assignment).length, 1);
  assert.equal(slots[1].assignment, null);
});

test("2 operators + 2 assembly + 2 disassembly retain all six assignments", () => {
  const all = ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"].flatMap((role) => assigned(2, role).map((item) => ({ ...item, id: `${role}:${item.id}` })));
  assert.equal(all.length, 6);
  for (const role of ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"]) assert.equal(buildStaffRoleSlots(role, 2, all).filter((slot) => slot.assignment).length, 2);
});

test("same collaborator cannot occupy two slots of the same role", () => {
  const first = assigned(1)[0];
  const slots = buildStaffRoleSlots("OPERATOR", 2, [first, { ...first, id: "duplicate" }]);
  assert.equal(slots.filter((slot) => slot.assignment).length, 1);
});

test("cancelling one of several collaborators releases only their slot", () => {
  const all = assigned(5);
  all[2].status = "CANCELLED";
  const slots = buildStaffRoleSlots("OPERATOR", 5, all);
  assert.equal(slots.filter((slot) => slot.assignment).length, 4);
  assert.ok(slots.some((slot) => slot.assignment?.id === all[0].id));
  assert.ok(!slots.some((slot) => slot.assignment?.id === all[2].id));
});

test("reopening / unordered reads preserve the slot projection and canonical IDs", () => {
  const all = assigned(12);
  assert.deepEqual(buildStaffRoleSlots("OPERATOR", 12, all), buildStaffRoleSlots("OPERATOR", 12, [...all].reverse()));
});

test("historical active assignments are never hidden by smaller demand", () => {
  assert.equal(buildStaffRoleSlots("OPERATOR", 1, assigned(2)).length, 2);
});

test("large quantities page their slots without allocating an unbounded DOM", () => {
  const slots = buildStaffRoleSlots("OPERATOR", 2147483647, [], { offset: 12, limit: 12 });
  assert.equal(slots.length, 12);
  assert.equal(slots[0].number, 13);
  assert.equal(slots[11].number, 24);
});

test("different collaborators with identical names are both counted", () => {
  const all = assigned(2).map((item) => ({ ...item, staffName: "José Pérez" }));
  const [row] = buildResponsibilityReadModel([{ role: "OPERATOR", required: 2, published: true }], all, []);
  assert.equal(row.assignedStaff.length, 2);
  assert.equal(row.remaining, 0);
});

test("quantity accepts positive integers without a one-person or 99-person cap", () => {
  for (const count of [1, 2, 5, 12, 100, 1000]) assert.equal(validStaffQuantity(count), true);
  for (const count of [0, -1, 1.5, NaN, Infinity, 2147483648]) assert.equal(validStaffQuantity(count), false);
});

test("quantity form is controlled and prevents React action automatic reset", () => {
  assert.match(ui, /value=\{quantity\}/);
  assert.match(ui, /event\.preventDefault\(\); save\(\)/);
  assert.doesNotMatch(ui, /defaultValue=\{required\}/);
  assert.match(ui, /cubiertos/);
  assert.match(ui, /Agregar slot/);
  assert.match(ui, /Quitar slot/);
});

test("individual assignment UI excludes occupied collaborators and uses retry-stable UUID", () => {
  assert.match(ui, /assignment\.staffId === member\.id/);
  assert.match(ui, /const \[requestId\] = useState\(\(\) => crypto\.randomUUID\(\)\)/);
  assert.match(ui, /initialRole=\{panel\.role\}/);
});

test("atomic mutations use the shared assignments/payment pipeline", () => {
  assert.match(actions, /rpc\("save_event_staff_assignment"/);
  assert.match(sql, /insert into public\.assignments/);
  assert.doesNotMatch(sql, /insert into public\.(event_staff_payments|staff_payment|staff_monthly)/);
  assert.match(sql, /'replay',true/);
  assert.match(sql, /El colaborador ya ocupa un slot/);
  assert.match(sql, /Editing hours\/notes must never revert/);
});

test("capacity and quantity edits use the same transaction lock", () => {
  assert.ok((sql.match(/:operational-assignment/g) ?? []).length >= 3);
  assert.match(sql, /p_required_quantity < occupied/);
  assert.match(sql, /occupied >= coalesce\(required,1\)/);
  assert.doesNotMatch(sql, /required_quantity between 0 and 99/);
});

test("person changes refresh old and new settlements without copying payment history", () => {
  assert.match(sql, /refresh_staff_event_payment\(old\.project_id,old\.staff_id/);
  assert.match(sql, /update of project_id,staff_id,assignment_type,status,deleted_at/);
  assert.doesNotMatch(sql, /update public\.event_staff_payments/);
});

test("readiness requires all configured roles and quantities", () => {
  assert.match(sql, /resource_row\.covered<resource_row\.required_quantity/);
  assert.match(sql, /'STAFF:'\|\|resource_row\.role/);
});
