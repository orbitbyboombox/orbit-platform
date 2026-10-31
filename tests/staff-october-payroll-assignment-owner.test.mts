import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20261031170000_staff_monthly_assignment_owner_reconciliation.sql",
  "utf8",
);

test("monthly settlement resolves owner from the assignment before legacy staff_id", () => {
  assert.match(migration, /coalesce\(assignment\.staff_id, \(settlement\)\.staff_id\)/);
  assert.match(migration, /assignment\.project_id = \(settlement\)\.project_id/);
  assert.match(migration, /assignment\.deleted_at is null/);
});

test("monthly account discovery uses the same canonical owner", () => {
  assert.match(migration, /create or replace function public\.generate_staff_monthly_accounts/);
  assert.match(migration, /coalesce\(assignment\.staff_id, payment\.staff_id\)/);
  assert.match(migration, /perform public\.ensure_staff_monthly_account\(member\.staff_id, month_start\)/);
});

test("backfill is limited to open derived accounts through the existing guarded RPC", () => {
  assert.match(migration, /perform public\.ensure_staff_monthly_account\(member\.staff_id, member\.accounting_month\)/);
  assert.match(migration, /No payment, movement, receipt/);
  assert.doesNotMatch(migration, /delete from public\.(event_staff_payments|event_staff_settlement_movements)/i);
});
