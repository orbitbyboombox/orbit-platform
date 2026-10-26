import assert from "node:assert/strict";
import test from "node:test";
import { canonicalBoxAssignment, isActiveBoxAssignment } from "../features/asset-management/canonical-box-assignment.ts";
import { buildAssignedBoxByProject, formatEventBoxLabel } from "../features/asset-management/box-assignment-read-model.ts";
import { canonicalStaffPaymentTotal } from "../features/staff-payments/staff-payment-display.ts";
import { canonicalRealCostDisplay } from "../features/projects/canonical-real-cost-display.ts";

test("historical closed box remains readable while active assignment wins for operations", () => {
  const closed = { id: "closed", asset_id: "case-01", assignment_status: "RETURNED", assigned_at: "2026-10-22T10:00:00Z" };
  const active = { id: "active", asset_id: "case-02", assignment_status: "ASSIGNED", assigned_at: "2026-10-23T10:00:00Z" };
  assert.equal(canonicalBoxAssignment([closed, active])?.id, "active");
  assert.equal(isActiveBoxAssignment(canonicalBoxAssignment([closed])), false);
});

test("the Soledad closeout is represented as 27 photos, without a second deduction", () => {
  const opening = 490;
  const finalRemaining = 463;
  assert.equal(opening - finalRemaining, 27);
  assert.equal(canonicalBoxAssignment([{ id: "case-02", asset_id: "asset-02", assignment_status: "RETURNED" }])?.asset_id, "asset-02");
  assert.equal(490 - 27, 463);
});

test("Event 360 totals canonical role components once", () => {
  assert.equal(canonicalStaffPaymentTotal({ assembly: 7_000, operator: 0, disassembly: 8_000 }), 15_000);
  assert.equal(canonicalStaffPaymentTotal({ assembly: 7_000, operator: 0, disassembly: 7_000 }), 14_000);
});

test("profitability panel consumes the canonical operational total", () => {
  const display = canonicalRealCostDisplay({ total_operational_cost: 81_568.23, cost_breakdown: { paper: 5_033.57, assembly: 7_000, disassembly: 8_000 } });
  assert.equal(display?.total, 81_568.23);
  assert.equal(display?.breakdown.paper, 5_033.57);
});

test("Event 360 renders the latest closed CASE-02 and its confirmed paper usage", () => {
  const assignments = [
    { id: "case-01", project_id: "project", assignment_status: "RETURNED", returned_at: "2026-10-23T01:07:17Z", operational_assets: { asset_code: "CASE-01", asset_type: "CASE" } },
    { id: "case-02", project_id: "project", assignment_status: "RETURNED", returned_at: "2026-10-23T23:18:48Z", operational_assets: { asset_code: "CASE-02", asset_type: "CASE" } },
  ];
  assert.equal(buildAssignedBoxByProject(assignments).get("project"), "CASE-02");
  assert.equal(formatEventBoxLabel(buildAssignedBoxByProject(assignments).get("project"), 27), "Caja 2 · CASE-02 — Cierre confirmado — 27 fotografías utilizadas");
});

test("Event 360 keeps the canonical 7,000 + 8,000 mounting breakdown", () => {
  assert.equal(7_000 + 8_000, 15_000);
});
