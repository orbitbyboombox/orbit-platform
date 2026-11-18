import assert from "node:assert/strict";
import test from "node:test";
import { buildRosterGroups } from "../features/staff-roster/official-roster-members.ts";

const assignment = (id: string, staffId: string, role: string, status = "CONFIRMED") => ({
  id, staff_id: staffId, assignment_type: role, status,
  staff: { first_name: "Staff", last_name: staffId, rut: null },
});

test("keeps every official role visible for an event with one operator", () => {
  const { groups } = buildRosterGroups([assignment("op", "A", "OPERATOR")]);
  assert.deepEqual(groups.map(group => [group.title, group.members.length]), [
    ["Operadores", 1], ["Montaje", 0], ["Desmontaje", 0], ["Supervisores", 0],
  ]);
});

test("includes both logistics roles whether assigned to one person or to different people", () => {
  for (const teardown of ["A", "B"]) {
    const { groups } = buildRosterGroups([
      assignment("setup", "A", "ASSEMBLY"),
      assignment("teardown", teardown, "DISASSEMBLY", "COMPLETED"),
      assignment("sup", "A", "SUPERVISOR", "ASSIGNED"),
      assignment("cancelled", "C", "DISASSEMBLY", "CANCELLED"),
    ]);
    assert.deepEqual(groups.map(group => group.members.map(member => member.staffId)), [[], ["A"], [teardown], ["A"]]);
  }
});

test("lists a multicaja operator once while retaining each assignment for the CASE layout", () => {
  const { groups, operators } = buildRosterGroups([
    assignment("first-case", "A", "OPERATOR"),
    assignment("second-case", "A", "OPERATOR"),
    assignment("third-case", "B", "OPERATOR"),
    assignment("rejected", "C", "OPERATOR", "REJECTED"),
  ]);
  assert.deepEqual(groups[0].members.map(member => member.staffId), ["A", "B"]);
  assert.deepEqual([...operators], [["first-case", "Staff A"], ["second-case", "Staff A"], ["third-case", "Staff B"]]);
});
