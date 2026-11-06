import { describe, expect, it } from "vitest";
import { reconcilePaperBlock, reconcilePaperHandoff, type PaperBlockCount } from "./paper-block-reconciliation";

const am: PaperBlockCount = {
  projectId: "ccu", boxId: "CASE-02", blockId: "AM",
  operatorAssignmentId: "sebastian", opening: 300, reloads: 50, remaining: 210,
};
const pm: PaperBlockCount = {
  projectId: "ccu", boxId: "CASE-02", blockId: "PM",
  operatorAssignmentId: "vaitiare", opening: 210, reloads: 100, remaining: 70,
};

describe("paper per operational block", () => {
  it("calculates opening + reloads - remaining", () => {
    expect(reconcilePaperBlock(am).used).toBe(140);
  });
  it("reconciles AM handoff to PM with different operators", () => {
    const result = reconcilePaperHandoff(am, pm);
    expect(result.used).toBe(380);
    expect(result.remaining).toBe(70);
    expect(result.reloads).toBe(150);
  });
  it("allows same operator for AM and PM", () => {
    expect(reconcilePaperHandoff(am, { ...pm, operatorAssignmentId: am.operatorAssignmentId }).used).toBe(380);
  });
  it("rejects negative, fractional and excess balances", () => {
    expect(() => reconcilePaperBlock({ ...am, remaining: -1 })).toThrow();
    expect(() => reconcilePaperBlock({ ...am, reloads: 1.5 })).toThrow();
    expect(() => reconcilePaperBlock({ ...am, remaining: 351 })).toThrow();
  });
  it("rejects mismatched handoff without silently adjusting stock", () => {
    expect(() => reconcilePaperHandoff(am, { ...pm, opening: 200 })).toThrow(/ajuste documentado/);
  });
  it("isolates each box and event", () => {
    expect(() => reconcilePaperHandoff(am, { ...pm, boxId: "CASE-03" })).toThrow();
    expect(() => reconcilePaperHandoff(am, { ...pm, projectId: "another" })).toThrow();
  });
  it("rejects duplicate block identity", () => {
    expect(() => reconcilePaperHandoff(am, { ...pm, blockId: "AM" })).toThrow();
  });
});
