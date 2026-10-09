import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  "supabase/migrations/20261009235500_guard_warehouse_transfer_pending_event_close.sql",
  "utf8",
);

test("warehouse transfer blocks a CASE with unresolved paper closeout", () => {
  assert.match(sql, /from public\.event_paper_snapshots eps/i);
  assert.match(sql, /eps\.box_asset_id\s*=\s*v_box\.id/i);
  assert.match(sql, /eps\.status\s*=\s*'PENDING'/i);
  assert.match(sql, /eps\.paper_required\s*=\s*true/i);
  assert.match(sql, /eps\.final_remaining_balance\s+is\s+null/i);
  assert.match(sql, /raise exception 'La caja tiene un cierre de papel pendiente/i);
});

test("warehouse transfers remain atomic, authenticated and whole-kit only", () => {
  assert.match(sql, /begin;[\s\S]*commit;/i);
  assert.match(sql, /v_actor\s*:=\s*auth\.uid\(\)/i);
  assert.match(sql, /mod\(p_quantity,700\)\s*<>\s*0/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /idempotency_key\s*=\s*p_idempotency_key/i);
  assert.match(sql, /update public\.supplies set current_stock/i);
  assert.match(sql, /update public\.operational_assets set metadata/i);
  assert.match(sql, /insert into public\.paper_warehouse_transfers/i);
});

test("warehouse guard migration does not alter existing stock or event history", () => {
  assert.doesNotMatch(sql, /update public\.event_paper_snapshots/i);
  assert.doesNotMatch(sql, /delete from public\./i);
  assert.doesNotMatch(sql, /update public\.financial_event_records/i);
});
