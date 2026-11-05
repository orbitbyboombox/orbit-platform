import assert from "node:assert/strict";
import test from "node:test";
import { emptyTotemLayout } from "../features/operations/event-totem-layout.ts";
import { buildEventTotemRoster } from "../features/operations/event-totem-roster.ts";

test("CCU seven positions appear in each operational block without multiplying events", () => {
  const layout = emptyTotemLayout(7);
  layout.enabled = true;
  layout.positions[0].assetId = "case-1";
  layout.positions[0].location = "Entrada norte";
  layout.positions[0].blocks = [{ blockId: "am", assignmentId: "op-am" }, { blockId: "pm", assignmentId: "op-pm" }];
  const roster = buildEventTotemRoster(layout, [{ id: "am", name: "09:00–13:30" }, { id: "pm", name: "15:00–19:30" }], new Map([["case-1", "CASE-01"]]), new Map([["op-am", "Operador AM"], ["op-pm", "Operador PM"]]));
  assert.equal(roster.length, 2);
  assert.equal(roster[0].rows.length, 7);
  assert.equal(roster[1].rows.length, 7);
  assert.equal(roster[0].rows[0].operator, "Operador AM");
  assert.equal(roster[1].rows[0].operator, "Operador PM");
  assert.equal(roster[0].rows[0].box, "CASE-01");
  assert.equal(roster[1].rows[0].location, "Entrada norte");
});

test("disabled feature generates no annex", () => {
  assert.deepEqual(buildEventTotemRoster(emptyTotemLayout(), [{ id: "am", name: "AM" }], new Map(), new Map()), []);
});
