import test from "node:test";
import assert from "node:assert/strict";
import { closePaperAM, closePaperPM, paperInventoryProposal } from "../features/portal-authentication/paper-block-closeout.ts";

const am = { projectId:"ccu", boxId:"case-02", blockId:"am", operatorAssignmentId:"sebastian", opening:300, reloads:100, remaining:180 };
const pm = { projectId:"ccu", boxId:"case-02", blockId:"pm", operatorAssignmentId:"vaitiare", opening:180, reloads:50, remaining:40 };

test("AM close is idempotent for same request and payload", () => {
  const state = closePaperAM({}, am, "sebastian", "request-am");
  assert.equal(closePaperAM(state, am, "sebastian", "request-am"), state);
});
test("AM cannot be overwritten with a different request", () => {
  const state = closePaperAM({}, am, "sebastian", "request-am");
  assert.throws(() => closePaperAM(state, am, "sebastian", "other-request"), /ya cerrado/);
});
test("PM requires prior AM", () => {
  assert.throws(() => closePaperPM({}, pm, "vaitiare", "request-pm"), /AM antes/);
});
test("PM must open with exact AM remainder", () => {
  const state = closePaperAM({}, am, "sebastian", "request-am");
  assert.throws(() => closePaperPM(state, { ...pm, opening:181 }, "vaitiare", "request-pm"), /distinto/);
});
test("PM close is idempotent and proposal counts both blocks once", () => {
  const state = closePaperAM({}, am, "sebastian", "request-am");
  const completed = closePaperPM(state, pm, "vaitiare", "request-pm");
  assert.equal(closePaperPM(completed, pm, "vaitiare", "request-pm"), completed);
  const proposal = paperInventoryProposal(completed);
  assert.equal(proposal.used, 410);
  assert.equal(proposal.reloads, 150);
  assert.equal(proposal.remaining, 40);
});
test("inventory proposal is blocked until both blocks close", () => {
  assert.throws(() => paperInventoryProposal(closePaperAM({}, am, "sebastian", "request-am")), /Faltan cierres/);
});
test("inventory proposal is blocked if already reconciled", () => {
  const state = closePaperPM(closePaperAM({}, am, "sebastian", "request-am"), pm, "vaitiare", "request-pm");
  assert.throws(() => paperInventoryProposal({ ...state, inventoryReconciledAt:"2026-11-05T22:00:00Z" }), /ya conciliado/);
});
