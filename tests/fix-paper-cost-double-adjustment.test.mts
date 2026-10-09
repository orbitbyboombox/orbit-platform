import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261009190000_fix_paper_cost_double_adjustment.sql",
  "utf8",
);

test("paper financial compatibility writer delegates to canonical operation cost", () => {
  assert.match(migration, /perform public\.sync_event_operation_cost\(p_project_id\)/);
  assert.match(migration, /totalOperationalCost', truth\.total_operational_cost/);
  assert.match(migration, /realCost', truth\.real_cost/);
  assert.doesNotMatch(migration, /next_resources\s*:=/);
  assert.doesNotMatch(migration, /old_paper\s*:=/);
});

test("paper close trigger recalculates through the canonical profitability path once", () => {
  assert.match(migration, /perform public\.sync_event_profitability\(new\.project_id\)/);
  assert.doesNotMatch(migration, /perform public\.sync_event_operation_cost\(new\.project_id\);\s*perform public\.sync_event_paper_cost_financials/);
});

test("migration does not mass-rewrite historical financial rows", () => {
  assert.doesNotMatch(migration, /do\s*\$\$/i);
  assert.doesNotMatch(migration, /update public\.financial_event_records/i);
  assert.match(migration, /explicit, reviewed reconciliation/i);
});
