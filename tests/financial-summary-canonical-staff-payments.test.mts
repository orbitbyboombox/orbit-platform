import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261007130000_financial_summary_canonical_staff_payments.sql", "utf8");

test("financial summary uses canonical active Staff payments and role overrides", () => {
  assert.match(migration, /event_staff_payment_role_totals/);
  assert.match(migration, /coalesce\(p\.override_operator_payment, p\.operator_payment, 0\)/);
  assert.match(migration, /p\.status <> 'CANCELLED'/);
  assert.match(migration, /CANONICAL_EVENT_STAFF_PAYMENTS_WITH_OVERRIDES/);
});
