import assert from "node:assert/strict";
import test from "node:test";
import { emptyTotemLayout, totemsForStaff, validateTotemLayout } from "../features/operations/event-totem-layout.ts";

test("CCU starts with seven unassigned physical positions and disabled feature", () => {
  const layout = emptyTotemLayout();
  assert.equal(layout.positions.length, 7);
  assert.equal(layout.enabled, false);
  assert.ok(layout.positions.every(p => p.assetId === null && p.location === ""));
});

test("one physical box may have different operators in AM and PM", () => {
  const layout = emptyTotemLayout(1);
  layout.enabled = true;
  layout.positions[0].assetId = "box-1";
  layout.positions[0].location = "Entrada norte";
  layout.positions[0].blocks = [{ blockId: "am", assignmentId: "op-am" }, { blockId: "pm", assignmentId: "op-pm" }];
  const context = { assetIds: new Set(["box-1"]), blockIds: new Set(["am", "pm"]), assignmentBlockIds: new Map([["op-am", "am"], ["op-pm", "pm"]]) };
  assert.deepEqual(validateTotemLayout(layout, context), []);
  assert.equal(totemsForStaff(layout, new Set(["op-am"])).length, 1);
  assert.equal(totemsForStaff(layout, new Set(["unassigned"])).length, 0);
});

test("duplicate boxes and cross-block staff assignments are rejected", () => {
  const layout = emptyTotemLayout(2);
  layout.enabled = true;
  layout.positions[0].assetId = "box-1";
  layout.positions[1].assetId = "box-1";
  layout.positions[1].blocks = [{ blockId: "pm", assignmentId: "op-am" }];
  const errors = validateTotemLayout(layout, { assetIds: new Set(["box-1"]), blockIds: new Set(["am", "pm"]), assignmentBlockIds: new Map([["op-am", "am"]]) });
  assert.ok(errors.some(e => e.includes("Duplicate physical box")));
  assert.ok(errors.some(e => e.includes("does not belong to block")));
});
