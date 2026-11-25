import assert from "node:assert/strict";
import test from "node:test";
import { emptyTotemLayout, getTotemFinalizationWarnings, totemsForStaff, validateTotemLayout, visibleTotemsForStaff } from "../features/operations/event-totem-layout.ts";

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

test("an existing event-level confirmed operator can be linked to its block", () => {
  const layout = emptyTotemLayout(1);
  layout.enabled = true;
  layout.positions[0].assetId = "box-1";
  layout.positions[0].blocks = [{ blockId: "event", assignmentId: "confirmed-general" }];
  const context = {
    assetIds: new Set(["box-1"]),
    blockIds: new Set(["event"]),
    assignmentBlockIds: new Map<string, string | null>([["confirmed-general", null]]),
  };
  assert.deepEqual(validateTotemLayout(layout, context), []);
  assert.equal(totemsForStaff(layout, new Set(["confirmed-general"])).length, 1);
});

test("one confirmed operator cannot be linked to two boxes or a different existing block", () => {
  const duplicate = emptyTotemLayout(2);
  duplicate.enabled = true;
  duplicate.positions[0].assetId = "box-1";
  duplicate.positions[1].assetId = "box-2";
  duplicate.positions[0].blocks = [{ blockId: "am", assignmentId: "operator" }];
  duplicate.positions[1].blocks = [{ blockId: "pm", assignmentId: "operator" }];
  const context = {
    assetIds: new Set(["box-1", "box-2"]),
    blockIds: new Set(["am", "pm"]),
    assignmentBlockIds: new Map<string, string | null>([["operator", null]]),
  };
  assert.ok(validateTotemLayout(duplicate, context).some(error => error.includes("Assignment used twice")));
  context.assignmentBlockIds.set("operator", "am");
  duplicate.positions[0].blocks = [];
  duplicate.positions[1].blocks = [{ blockId: "pm", assignmentId: "operator" }];
  assert.ok(validateTotemLayout(duplicate, context).some(error => error.includes("does not belong to block")));
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

test("supervisor can see all positions but an unassigned operator cannot", () => {
  const layout = emptyTotemLayout(7);
  layout.enabled = true;
  assert.equal(visibleTotemsForStaff(layout, new Set(), true).length, 7);
  assert.equal(visibleTotemsForStaff(layout, new Set(), false).length, 0);
});

test("partial drafts can save with boxes first or operators first, while finalization remains blocked", () => {
  const boxesFirst = emptyTotemLayout(2);
  boxesFirst.enabled = true;
  boxesFirst.positions[0].assetId = "box-1";
  assert.deepEqual(validateTotemLayout(boxesFirst, { assetIds: new Set(["box-1"]), blockIds: new Set(), assignmentBlockIds: new Map() }), []);
  assert.ok(getTotemFinalizationWarnings(boxesFirst, [{ id: "op-1", blockId: null, assignmentType: "OPERATOR" }, { id: "op-2", blockId: null, assignmentType: "OPERATOR" }], new Set()).length > 0);

  const operatorsFirst = emptyTotemLayout(1);
  operatorsFirst.enabled = true;
  operatorsFirst.positions[0].blocks = [{ blockId: "service", assignmentId: "op-1" }];
  assert.deepEqual(validateTotemLayout(operatorsFirst, { assetIds: new Set(), blockIds: new Set(["service"]), assignmentBlockIds: new Map([["op-1", null]]) }), []);
  assert.ok(getTotemFinalizationWarnings(operatorsFirst, [{ id: "op-1", blockId: null, assignmentType: "OPERATOR" }], new Set(["service"])).length > 0);
});

test("assembly and disassembly roles do not count as box operators", () => {
  const layout = emptyTotemLayout(1);
  layout.enabled = true;
  layout.positions[0].assetId = "box-1";
  assert.ok(getTotemFinalizationWarnings(layout, [
    { id: "assembly", blockId: null, assignmentType: "ASSEMBLY" },
    { id: "disassembly", blockId: null, assignmentType: "DISASSEMBLY" },
  ], new Set()).some(warning => warning.includes("operadores de servicio")));
});
