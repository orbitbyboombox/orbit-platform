import test from "node:test";
import assert from "node:assert/strict";
import { reconcilePaperBlock, reconcilePaperHandoff } from "../features/portal-authentication/paper-block-reconciliation.ts";

const am = { projectId: "ccu", boxId: "CASE-02", blockId: "AM", operatorAssignmentId: "sebastian", opening: 300, reloads: 50, remaining: 210 };
const pm = { projectId: "ccu", boxId: "CASE-02", blockId: "PM", operatorAssignmentId: "vaitiare", opening: 210, reloads: 100, remaining: 70 };

test("AM consumption accounts for reloads", () => {
  assert.equal(reconcilePaperBlock(am).used, 140);
});
test("AM to PM handoff with different operators", () => {
  const result = reconcilePaperHandoff(am, pm);
  assert.equal(result.used, 380);
  assert.equal(result.remaining, 70);
  assert.equal(result.reloads, 150);
});
test("same operator may handle both blocks", () => {
  assert.equal(reconcilePaperHandoff(am, { ...pm, operatorAssignmentId: am.operatorAssignmentId }).used, 380);
});
test("reject invalid balances", () => {
  for (const invalid of [{ ...am, remaining: -1 }, { ...am, reloads: 1.5 }, { ...am, remaining: 351 }]) {
    assert.throws(() => reconcilePaperBlock(invalid));
  }
});
test("reject mismatched handoff", () => {
  assert.throws(() => reconcilePaperHandoff(am, { ...pm, opening: 200 }), /ajuste documentado/);
});
test("prevent cross-box or cross-event handoff", () => {
  assert.throws(() => reconcilePaperHandoff(am, { ...pm, boxId: "CASE-03" }));
  assert.throws(() => reconcilePaperHandoff(am, { ...pm, projectId: "other" }));
});
test("reject identical AM and PM block IDs", () => {
  assert.throws(() => reconcilePaperHandoff(am, { ...pm, blockId: "AM" }));
});
