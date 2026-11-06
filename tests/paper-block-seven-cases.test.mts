import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePaperHandoff } from "../features/portal-authentication/paper-block-reconciliation.ts";

const eventId = "ORB-2026-268105";
const boxes = ["CASE-01","CASE-02","CASE-03","CASE-04","CASE-05","CASE-06","CASE-07"];

test("seven CCU cases reconcile independently with AM and PM reloads", () => {
  const results = boxes.map((boxId, index) => {
    const opening = 300 + index * 10;
    const amReloads = index * 2;
    const amRemaining = opening + amReloads - 35;
    const pmReloads = index * 3;
    const pmRemaining = amRemaining + pmReloads - 42;
    return reconcilePaperHandoff(
      { projectId:eventId, boxId, blockId:"AM", operatorAssignmentId:`am-${index}`, opening, reloads:amReloads, remaining:amRemaining },
      { projectId:eventId, boxId, blockId:"PM", operatorAssignmentId:`pm-${index}`, opening:amRemaining, reloads:pmReloads, remaining:pmRemaining },
    );
  });
  assert.equal(results.length,7);
  assert.equal(new Set(results.map((result)=>result.boxId)).size,7);
  for (const result of results) {
    assert.equal(result.used,77);
    assert.equal(result.used,result.opening+result.reloads-result.remaining);
    assert.equal(result.blocks[0].remaining,result.blocks[1].opening);
  }
  assert.equal(results.reduce((sum,result)=>sum+result.used,0),539);
});

test("wrong box, block, and AM-to-PM balance cannot be reconciled", () => {
  const am={ projectId:eventId,boxId:"CASE-01",blockId:"AM",operatorAssignmentId:"a",opening:300,reloads:0,remaining:250 };
  const pm={ projectId:eventId,boxId:"CASE-01",blockId:"PM",operatorAssignmentId:"b",opening:250,reloads:10,remaining:200 };
  assert.throws(()=>reconcilePaperHandoff(am,{...pm,boxId:"CASE-02"}),/mismo evento y caja/);
  assert.throws(()=>reconcilePaperHandoff(am,{...pm,blockId:"AM"}),/bloques diferentes/);
  assert.throws(()=>reconcilePaperHandoff(am,{...pm,opening:251}),/Saldo AM/);
});
