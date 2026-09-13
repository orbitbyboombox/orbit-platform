import test from "node:test";
import assert from "node:assert/strict";
import { buildResponsibilityReadModel } from "../features/staff-assignment-center/staff-responsibility-read-model.ts";
import { readFileSync } from "node:fs";
const requirementsMigration = readFileSync("supabase/migrations/0264_boombox_three_role_staff_requirements.sql", "utf8");

const requirement = (role: string, required = 1) => [{ role, required, published: true }];

test("active assignment is the visible responsibility owner", () => {
  const [row] = buildResponsibilityReadModel(requirement("OPERATOR"), [{ role: "OPERATOR", status: "ASSIGNED", staffName: "José Rodriguez" }], []);
  assert.deepEqual(row.assignedStaff, ["José Rodriguez"]);
  assert.equal(row.status, "ASSIGNED");
});

test("pending request is shown only when no active owner exists", () => {
  const [row] = buildResponsibilityReadModel(requirement("ASSEMBLY"), [], [{ role: "ASSEMBLY", staffName: "José Rodriguez" }]);
  assert.deepEqual(row.pendingStaff, ["José Rodriguez"]);
  assert.equal(row.status, "PENDING");
});

test("accepted request converted to assignment is displayed once", () => {
  const [row] = buildResponsibilityReadModel(requirement("DISASSEMBLY"), [{ role: "DISASSEMBLY", status: "CONFIRMED", staffName: "José Rodriguez" }], [{ role: "DISASSEMBLY", staffName: "José Rodriguez" }]);
  assert.deepEqual(row.assignedStaff, ["José Rodriguez"]);
  assert.deepEqual(row.pendingStaff, []);
});

test("cancelled assignment removes the owner", () => {
  const [row] = buildResponsibilityReadModel(requirement("OPERATOR"), [{ role: "OPERATOR", status: "CANCELLED", staffName: "José Rodriguez" }], []);
  assert.deepEqual(row.assignedStaff, []);
  assert.equal(row.status, "VACANT");
});

test("duplicate assignment rows do not duplicate staff display", () => {
  const [row] = buildResponsibilityReadModel(requirement("OPERATOR", 2), [
    { role: "OPERATOR", status: "ASSIGNED", staffName: "José Rodriguez" },
    { role: "OPERATOR", status: "ASSIGNED", staffName: "José Rodriguez" },
  ], []);
  assert.deepEqual(row.assignedStaff, ["José Rodriguez"]);
});

test("cancelled assignments release the Staff portal slot", () => {
  const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
  assert.match(portal, /\[\"CANCELLED\",\"REJECTED\"\]\.includes\(row\.status\)\)continue/);
});

test("BOOMBOX publication defaults to three independent roles without overwriting overrides", () => {
  assert.match(requirementsMigration, /resolve_boombox_default_staff_requirements/);
  assert.match(requirementsMigration, /'ASSEMBLY', 1/);
  assert.match(requirementsMigration, /'DISASSEMBLY', 1/);
  assert.match(requirementsMigration, /role in \('ASSEMBLY', 'DISASSEMBLY'\)/);
  assert.match(requirementsMigration, /on conflict \(project_id, role\)/);
});
