import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/0253_staff_no_work_removal.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../features/resources/staff-management/infrastructure/supabase-staff.repository.ts", import.meta.url), "utf8");

test("no-work removal is canonical, locked and idempotent", () => {
  assert.match(migration, /create or replace function public\.remove_staff_from_event_no_work/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status='CANCELLED'/);
  assert.match(migration, /correlation := 'staff-no-work:/);
  assert.match(migration, /if not exists\(select 1 from public\.timeline_events where correlation_id=correlation\)/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test("paid or finalized periods fail closed before removal", () => {
  assert.match(migration, /payment_count > 0/);
  assert.match(migration, /paid_amount > 0/);
  assert.match(migration, /payment_status='PAID' or a\.settlement_status='FINALIZED'/);
  assert.match(migration, /using errcode='55000'/);
});

test("repository delegates removal to the single server operation", () => {
  assert.match(repository, /rpc\("remove_staff_from_event_no_work"/);
  assert.doesNotMatch(repository, /from\("assignments"\)\.update\(\{ deleted_at/);
});

test("the operation preserves ledger movements and refreshes monthly projection", () => {
  assert.match(migration, /ensure_staff_monthly_account/);
  assert.match(migration, /event_staff_settlement_movements/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(event_staff|staff_monthly|assignments)/i);
});

test("authorization is restricted to Founder/Admin", () => {
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /errcode='42501'/);
});
