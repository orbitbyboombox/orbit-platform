import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20261007200000_staff_realized_upcoming_canonical_finance.sql",
  "utf8",
);
const fix = readFileSync(
  "supabase/migrations/20261007200500_fix_staff_settlement_record_access.sql",
  "utf8",
);
const model = readFileSync("features/staff-monthly-account/model.ts", "utf8");
const panel = readFileSync(
  "features/staff-monthly-account/staff-monthly-account-panel.tsx",
  "utf8",
);

test("future Staff obligations are projected separately from worked honoraria", () => {
  assert.match(migration, /staff_payment_is_realized/);
  assert.match(migration, /'upcomingTotal', upcoming_total/);
  assert.match(migration, /'upcomingDetails', upcoming_details/);
  assert.match(migration, /settlement\.status <> 'CANCELLED'/);
  assert.match(migration, /realized and settlement\.status = 'CONFIRMED'/);
});

test("confirmed block assignments synchronize their existing settlement", () => {
  assert.match(migration, /payment\.assignment_id is not null/);
  assert.match(migration, /assignment\.status in \('CONFIRMED','ACCEPTED','COMPLETED','REALIZED','FINISHED','CLOSED'\)/);
  assert.match(migration, /when payment\.status = 'PAID' then payment\.status/);
});

test("monthly account refresh keeps reimbursements separate and non-null", () => {
  assert.match(migration, /reimbursements_paid_total = coalesce/);
  assert.match(migration, /reimbursements_pending_total = coalesce/);
  assert.match(migration, /finalTransferAmount/);
});

test("the corrected calculation is applied after the record-access fix", () => {
  assert.match(fix, /create or replace function public\.calculate_staff_monthly_settlement/);
  assert.match(fix, /\(settlement\)\.total_internal_payment/);
  assert.match(fix, /'CANONICAL_STAFF_MONTHLY_SETTLEMENT_V5'/);
});

test("Staff UI exposes projected work without presenting it as worked", () => {
  assert.match(model, /upcomingDetails/);
  assert.match(model, /upcomingTotal/);
  assert.match(panel, /PRÓXIMOS TRABAJOS/);
  assert.match(panel, /Proyectados, aún no trabajados/);
});
