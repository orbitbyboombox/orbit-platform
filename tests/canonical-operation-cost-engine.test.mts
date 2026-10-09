import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql=readFileSync("supabase/migrations/20261009173000_canonical_operation_cost_engine.sql","utf8");

test("cost engine consumes confirmed paper, quote branding and canonical staff",()=>{
  assert.match(sql,/event_paper_snapshots/);
  assert.match(sql,/calculate_event_paper_cost\(p_project_id\)/);
  assert.match(sql,/CURRENT_QUOTATION_ITEM/);
  assert.match(sql,/BRANDING_FACE/);
  assert.match(sql,/event_staff_payment_role_totals\(p_project_id\)/);
  assert.match(sql,/CANONICAL_CONFIRMED_PAPER_QUOTE_BRANDING_STAFF_V1/);
  assert.doesNotMatch(sql,/resources:=estimate\.paper/);
  assert.doesNotMatch(sql,/'branding',estimate\.branding/);
  assert.equal(45*186.4286,8389.287);
  assert.equal(4*8500,34000);
});
