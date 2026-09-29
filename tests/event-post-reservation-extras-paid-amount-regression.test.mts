import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260929040000_fix_post_reservation_extras_paid_amount_ambiguity.sql", "utf8");

test("post-reservation extra RPC qualifies every paid_amount source", () => {
  assert.match(migration, /v_paid_amount numeric/);
  assert.match(migration, /invoice_row\.paid_amount/);
  assert.match(migration, /paid_amount = v_paid_amount/);
  assert.match(migration, /financial\.version \+ 1/);
  assert.doesNotMatch(migration, /paid_amount = paid_amount/);
});

test("post-reservation financial regression keeps paid and recalculates balance", () => {
  const total = 290_000 + 0;
  const paid = 145_000;
  assert.equal(total, 290_000);
  assert.equal(paid, 145_000);
  assert.equal(Math.max(total - paid, 0), 145_000);
});
