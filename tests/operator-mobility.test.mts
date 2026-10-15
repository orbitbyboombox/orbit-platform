import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { operatorMobilityEligibility, resolveApprovedOperatorMobility, suggestedOperatorMobilityAmount } from "../features/staff-payments/operator-mobility.ts";

const exclusions = new Set(["sebastian-id", "fernando-id", "jose-id"]);
const base = { eventDate: "2026-10-17", role: "OPERATOR", staffId: "other-id", excludedStaffIds: exclusions, commune: "Colina" };
test("province communes suggest exactly 12k or 17k", () => {
  for (const c of ["Lampa","Colina","Batuco","Pirque","San José de Maipo","San Bernardo","Buin","Calera de Tango","Paine"]) assert.equal(suggestedOperatorMobilityAmount(c),12_000,c);
  for (const c of ["Melipilla","Curacaví","Talagante","El Monte","Isla de Maipo","Peñaflor","Padre Hurtado"]) assert.equal(suggestedOperatorMobilityAmount(c),17_000,c);
  assert.equal(suggestedOperatorMobilityAmount("Las Condes"),null);
});
test("effective only for Oct 17 2026 and later", () => {
  assert.equal(operatorMobilityEligibility({...base,eventDate:"2026-10-16"}).eligible,false);
  assert.equal(operatorMobilityEligibility(base).eligible,true);
});
test("never applies to assembly or disassembly", () => {
  for (const role of ["ASSEMBLY","DISASSEMBLY"]) assert.equal(operatorMobilityEligibility({...base,role}).eligible,false);
});
test("exclusions enforced by verified staff IDs, not ambiguous names", () => {
  for (const staffId of exclusions) assert.equal(operatorMobilityEligibility({...base,staffId}).eligible,false);
});
test("manual confirmation required, defaults off", () => {
  const eligible=operatorMobilityEligibility(base);
  assert.equal(resolveApprovedOperatorMobility({...eligible,approvedByFounder:false,travelsIndependently:true}),0);
  assert.equal(resolveApprovedOperatorMobility({...eligible,approvedByFounder:true,travelsIndependently:false}),0);
  assert.equal(resolveApprovedOperatorMobility({...eligible,approvedByFounder:true,travelsIndependently:true}),12_000);
});

test("persistence is an idempotent update of the canonical operator settlement", () => {
  const source = readFileSync("features/staff-assignment-center/actions.ts", "utf8");
  assert.match(source, /\.from\("event_staff_payments"\)/);
  assert.match(source, /\.update\(\{ transport_bonus: requestedMobilityAmount/);
  assert.match(source, /\.eq\("project_id", input\.projectId\)/);
  assert.match(source, /\.eq\("staff_id", input\.staffId\)/);
  assert.match(source, /\(payments \?\? \[\]\)\.length !== 1/);
});

test("the assignment control is opt-in and limited to operators", () => {
  const source = readFileSync("features/staff-assignment-center/staff-assignment-center.tsx", "utf8");
  assert.match(source, /name="applyMobility" type="checkbox"/);
  assert.match(source, /role === "OPERATOR" && mobilitySuggestion !== null/);
});
