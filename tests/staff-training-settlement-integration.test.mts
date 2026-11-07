import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261105110000_staff_training_settlement_integration.sql", import.meta.url), "utf8");
const pdf = readFileSync(new URL("../features/staff-monthly-account/settlement-pdf.ts", import.meta.url), "utf8");

test("training settlement integration is additive and protects closed payroll", () => {
  assert.match(migration, /calculate_staff_monthly_settlement_legacy/);
  assert.match(migration, /account_status in \('FINALIZED', 'CLOSED', 'PAID'\) or payment_status = 'PAID'/);
  assert.match(migration, /status = 'COMPLETED'/);
  assert.match(migration, /'CAPACITACIÓN'/);
  assert.match(migration, /complete_staff_training/);
  assert.match(migration, /grant execute on function public\.complete_staff_training\(uuid\) to authenticated/);
});

test("official settlement PDF renders the canonical detail service and roles", () => {
  assert.match(pdf, /detail\.service/);
  assert.match(pdf, /detail\.roles\.join/);
  assert.match(pdf, /detail\.workNet/);
});

const generationMigration = readFileSync(new URL("../supabase/migrations/20261107190000_include_completed_training_in_monthly_accounts.sql", import.meta.url), "utf8");

test("monthly generator includes completed training-only staff without duplicates", () => {
  assert.match(generationMigration, /select distinct source\.staff_id/);
  assert.match(generationMigration, /union all\s+select training\.trainee_staff_id/);
  assert.match(generationMigration, /training\.status = 'COMPLETED'/);
  assert.match(generationMigration, /project\.deleted_at is null/);
  assert.match(generationMigration, /project\.event_date >= month_start/);
  assert.match(generationMigration, /ensure_staff_monthly_account\(member\.staff_id, month_start\)/);
});
