import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260928200000_staff_boleta_review_financial_guard.sql", "utf8");

test("boleta review uses financial close guards", () => {
  assert.doesNotMatch(sql, /staff_monthly_blocking_events/);
  assert.match(sql, /item\.settlement_status<>'FINALIZED'/);
  assert.match(sql, /item\.review_required/);
  assert.match(sql, /status in\('CLOSED','PAID'\)/);
});

test("approval preserves the flexible payment states", () => {
  assert.match(sql, /final_transfer_amount=0 then 'PAID'/);
  assert.match(sql, /payment_status='PAID' then 'PAID'/);
  assert.match(sql, /then 'READY_TO_PAY'/);
});
