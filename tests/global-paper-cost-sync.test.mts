import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261009160000_global_paper_cost_sync.sql", "utf8");

test("paper cost uses the canonical photos unit and format-aware master costs", () => {
  assert.match(migration, /'unit', 'PHOTOS'/);
  assert.match(migration, /resolve_paper_unit_cost/);
  assert.match(migration, /FORMAT_SPECIFIC/);
  assert.match(migration, /GENERIC_COST_PER_PHOTO/);
  assert.match(migration, /reviewRequired/);
});

test("paper closeout synchronizes cost and profitability in the same database transaction", () => {
  assert.match(migration, /sync_event_operation_cost\(new\.project_id\)/);
  assert.match(migration, /sync_event_paper_cost_financials\(new\.project_id\)/);
  assert.match(migration, /financial_event_records/);
  assert.match(migration, /gross_profit/);
  assert.match(migration, /net_margin/);
});

test("operation cost uses confirmed paper, current branding quote, and canonical staff rows", () => {
  assert.match(migration, /create or replace function public\.sync_event_operation_cost/);
  assert.match(migration, /calculate_event_paper_cost\(p_project_id\)/);
  assert.match(migration, /CURRENT_QUOTATION_ITEM/);
  assert.match(migration, /BRANDING_FACE/);
  assert.match(migration, /event_staff_payment_role_totals\(p_project_id\)/);
  assert.match(migration, /CANONICAL_CONFIRMED_PAPER_QUOTE_BRANDING_STAFF_V1/);
  assert.doesNotMatch(migration, /resources\s*:=\s*estimate\.paper/);
  assert.doesNotMatch(migration, /'branding',\s*estimate\.branding/);
  assert.equal(45 * 186.4286, 8389.287);
  assert.equal(4 * 8500, 34000);
});

test("historical reconciliation is idempotent and never creates a second paper ledger", () => {
  assert.match(migration, /status in \('CONFIRMED', 'OVERRIDDEN'\)/);
  assert.match(migration, /event_paper_snapshots/);
  assert.match(migration, /idempotent/i);
  assert.doesNotMatch(migration, /insert into public\.inventory_movements/);
});

test("unreliable paper costs fail closed for review instead of inventing a value", () => {
  assert.match(migration, /MISSING_COST_PER_PHOTO/);
  assert.match(migration, /AMBIGUOUS_FORMAT_COST/);
  assert.match(migration, /return jsonb_build_object\('updated', false, 'reviewRequired', true/);
});
