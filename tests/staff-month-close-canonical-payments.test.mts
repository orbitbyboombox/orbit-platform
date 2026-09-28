import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260928020000_staff_month_close_from_canonical_payments.sql",
  "utf8",
);

test("monthly close is driven by confirmed canonical staff payments", () => {
  assert.match(migration, /event_staff_payments/);
  assert.match(migration, /payment\.status='CONFIRMED'/);
  assert.match(migration, /payment\.deleted_at is null/);
  assert.match(migration, /operationalCloseRequired',false/);
  assert.doesNotMatch(migration, /staff_monthly_blocking_events\(staff_id,month_start\)/);
});

test("zero-value staff accounts are excluded without blocking valid staff", () => {
  assert.match(migration, /account_row\.work_net<=0/);
  assert.match(migration, /EXCLUDED_ZERO_VALUE/);
  assert.match(migration, /finalizedStaff/);
  assert.match(migration, /excludedStaff/);
});

test("close is idempotent once the monthly close is closed", () => {
  assert.match(migration, /close_row\.status in\('CLOSED','PAID'\)/);
  assert.match(migration, /staff_monthly_close_items/);
  assert.match(migration, /on conflict do nothing/);
});
