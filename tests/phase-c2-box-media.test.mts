import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260925100000_phase_c2_box_media_tracking.sql", "utf8");
const reconcile = readFileSync("supabase/migrations/20260925101000_phase_c2_balance_guard_reconcile.sql", "utf8");

test("C.2 registers the canonical photo formats", () => {
  for (const format of ["PHOTO_5X15", "PHOTO_10X15", "PHOTO_7_5X10"]) assert.match(migration, new RegExp(format));
});

test("C.2 stores before/delta/after and lot linkage in the shared movement ledger", () => {
  for (const column of ["media_lot_id", "box_asset_id", "printer_asset_id", "quantity_before", "quantity_delta", "quantity_after"]) assert.match(migration, new RegExp(column));
  assert.match(migration, /inventory_movements_media_lot_id_fkey/);
});

test("C.2 accepts the new movement vocabulary without removing legacy movements", () => {
  assert.match(migration, /PURCHASE[\s\S]*CONSUMPTION[\s\S]*ADJUSTMENT[\s\S]*LOSS[\s\S]*REPLACEMENT[\s\S]*LOAD[\s\S]*EVENT_USAGE[\s\S]*MANUAL_ADJUSTMENT[\s\S]*RETURN[\s\S]*DISCARD/);
});

test("C.2 rejects negative or over-capacity balances and protects media history", () => {
  assert.match(migration, /Media balance cannot be negative or exceed initial capacity/);
  assert.match(migration, /Media movement history is immutable/);
  assert.match(migration, /A positive RETURN requires an explicit adjustment reason/);
});

test("C.2 synchronizes the lot balance from the append-only movement", () => {
  assert.match(migration, /sync_box_media_lot_balance/);
  assert.match(migration, /inventory_movements_sync_media_lot/);
});

test("C.2 uses one atomic server-side load path", () => {
  assert.match(migration, /create_box_media_lot_with_load/);
  assert.match(migration, /grant execute on function public\.create_box_media_lot_with_load[\s\S]*service_role/);
  assert.match(reconcile, /exists \(select 1 from public\.profiles/);
});

test("C.2 keeps TEST-only application evidence separate from Production", () => {
  assert.match(migration, /Phase C\.2/);
  assert.doesNotMatch(migration, /uiwlcmbrowtmqwhnsnxz/);
  assert.doesNotMatch(reconcile, /uiwlcmbrowtmqwhnsnxz/);
});
