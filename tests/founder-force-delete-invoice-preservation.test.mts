import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260924000000_founder_force_delete_invoice_archive_safe.sql",
  "utf8",
);

test("normal force delete archives real invoices with a valid state", () => {
  assert.match(migration, /financial_record_state='ARCHIVED'/);
  assert.match(migration, /archived_at=coalesce\(archived_at,now\(\)\)/);
  assert.match(migration, /archived_by=coalesce\(archived_by,actor\)/);
});

test("invoice and payment values are not mutated by the normal-delete fix", () => {
  assert.doesNotMatch(migration, /paid_amount\s*=/i);
  assert.doesNotMatch(migration, /amount\s*=/i);
  assert.doesNotMatch(migration, /status\s*=/i);
  assert.doesNotMatch(migration, /invoice_payments|receivable_movements/i);
});

test("the invalid financial state is rejected by the source contract", () => {
  assert.match(migration, /invalid invoice financial state mutation/);
  assert.match(migration, /pg_get_functiondef\('public\.purge_event_controlled/);
});
