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
  assert.match(source, /save_event_staff_assignment_with_mobility/);
  assert.match(source, /p_mobility_action/);
  assert.match(source, /p_mobility_amount/);
  assert.doesNotMatch(source, /transport_bonus:\s*requestedMobilityAmount/);
  const migration = readFileSync("supabase/migrations/20261015153000_operator_mobility_atomic.sql", "utf8");
  assert.match(migration, /create unique index[\s\S]*event_staff_operator_mobility_one_per_settlement_idx/);
  assert.match(migration, /save_event_staff_assignment_with_mobility/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /payment_count <> 1/);
  assert.match(migration, /settlement_status in \('PAID','FINALIZED'\)/);
});

test("mobility adjustment is independent from legacy transport_bonus", () => {
  const migration = readFileSync("supabase/migrations/20261015153000_operator_mobility_atomic.sql", "utf8");
  assert.match(migration, /does not reuse event_staff_payments\.transport_bonus/);
  assert.match(migration, /comment = 'Movilización operador'/);
  assert.match(migration, /p_mobility_action = 'APPLY'/);
  assert.match(migration, /p_mobility_action = 'CLEAR'/);
});

test("server-side guard enforces date, role, exclusions and commune amount", () => {
  const migration = readFileSync("supabase/migrations/20261015153000_operator_mobility_atomic.sql", "utf8");
  assert.match(migration, /event_date < date '2026-10-17'/);
  assert.match(migration, /assignment_role <> 'OPERATOR'/);
  assert.match(migration, /07683338-3ff1-4235-9253-1efeeed4a7c1/);
  assert.match(migration, /353b9538-7d1c-4048-b71f-17854bde78ce/);
  assert.match(migration, /bd31d438-42fc-474a-87b6-a5f68f626fea/);
  assert.match(migration, /normalized_commune/);
});

test("canonical finance paths already consume settlement adjustments", () => {
  const financials = readFileSync("supabase/migrations/20261006120000_staff_assignment_payment_overrides.sql", "utf8");
  const profitability = readFileSync("supabase/migrations/20261003101500_real_paper_cost_profitability_from_20261002.sql", "utf8");
  const reconciliation = readFileSync("supabase/migrations/20261007130000_financial_summary_canonical_staff_payments.sql", "utf8");
  assert.match(financials, /sum\(amount\) total[\s\S]*event_staff_settlement_adjustments/);
  assert.match(profitability, /event_staff_settlement_adjustments/);
  assert.match(reconciliation, /event_staff_settlement_adjustments/);
});

test("the assignment control is opt-in and limited to operators", () => {
  const source = readFileSync("features/staff-assignment-center/staff-assignment-center.tsx", "utf8");
  assert.match(source, /name="applyMobility" type="checkbox"/);
  assert.match(source, /role === "OPERATOR" && mobilitySuggestion !== null/);
  assert.match(source, /EXCLUDED_OPERATOR_MOBILITY_STAFF_IDS\.has\(selectedStaffId\)/);
});

test("assignment props read the independent mobility adjustment, not legacy transport_bonus", () => {
  const source = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
  assert.match(source, /comment === "Movilización operador"/);
  assert.match(source, /settlementAdjustments \?\? \[\]\)\.find/);
  assert.doesNotMatch(source, /mobilityAmount:[^\n]*transport_bonus/);
});
