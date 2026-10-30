import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261029160000_founder_force_delete_staff_dependencies_order_safe.sql",
  "utf8",
);

test("staff cancellations, settlement children and projections are ordered before assignment deletion", () => {
  const cancellations = migration.indexOf("delete from public.staff_assignment_cancellations");
  const adjustments = migration.indexOf("delete from public.event_staff_settlement_adjustments");
  const movements = migration.indexOf("delete from public.event_staff_settlement_movements");
  const payments = migration.lastIndexOf("delete from public.event_staff_payments");
  assert.ok(cancellations >= 0 && adjustments > cancellations && movements > adjustments && payments > movements);
});

test("no audit trigger or customer data is disabled by the dependency repair", () => {
  assert.doesNotMatch(migration, /disable trigger|drop trigger|hard_purge_test_mode/i);
  assert.doesNotMatch(migration, /delete from public\.timeline_events|delete from public\.customers/i);
  assert.match(migration, /paid_amount,0\)=0/);
  assert.match(migration, /settlement_status not in \('PAID','FINALIZED'\)/);
});
