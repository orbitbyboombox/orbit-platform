import assert from "node:assert/strict";
import test from "node:test";
import { assignedBoxCode, buildAssignedBoxByProject } from "../features/asset-management/box-assignment-read-model.ts";

test("canonical box reads accept BOX and CASE asset types", () => {
  assert.equal(assignedBoxCode({ project_id: "rosario", assignment_status: "ASSIGNED", operational_assets: { asset_code: "CASE-02", asset_type: "BOX" } }), "CASE-02");
  assert.equal(assignedBoxCode({ project_id: "abigail", assignment_status: "ASSIGNED", operational_assets: { asset_code: "CASE-01", asset_type: "CASE" } }), "CASE-01");
});

test("canonical box reads ignore inactive, deleted, and non-box assignments", () => {
  assert.equal(assignedBoxCode({ project_id: "pending", assignment_status: "PENDING", operational_assets: { asset_code: "CASE-01", asset_type: "BOX" } }), null);
  assert.equal(assignedBoxCode({ project_id: "deleted", assignment_status: "ASSIGNED", deleted_at: "2026-10-01T00:00:00Z", operational_assets: { asset_code: "CASE-01", asset_type: "BOX" } }), null);
  assert.equal(assignedBoxCode({ project_id: "vehicle", assignment_status: "ASSIGNED", operational_assets: { asset_code: "VAN-01", asset_type: "VEHICLE" } }), null);
});

test("one canonical box is exposed per project without changing assignments", () => {
  const result = buildAssignedBoxByProject([
    { project_id: "rosario", assignment_status: "ASSIGNED", operational_assets: { asset_code: "CASE-02", asset_type: "BOX" } },
    { project_id: "rosario", assignment_status: "ASSIGNED", operational_assets: { asset_code: "CASE-03", asset_type: "CASE" } },
  ]);
  assert.deepEqual([...result.entries()], [["rosario", "CASE-02"]]);
});
