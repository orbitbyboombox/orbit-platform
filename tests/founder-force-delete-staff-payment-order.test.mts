import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261029154000_founder_force_delete_staff_payment_order_safe.sql",
  "utf8",
);

test("unpaid staff payment projections are removed before assignments", () => {
  const payment = migration.indexOf("delete from public.event_staff_payments");
  const assignment = migration.lastIndexOf("delete from public.asset_assignments where project_id=p_project_id");
  assert.ok(payment >= 0 && assignment > payment);
  assert.match(migration, /coalesce\(paid_amount,0\)=0/);
  assert.match(migration, /settlement_status not in \('PAID','FINALIZED'\)/);
});

test("paid and finalized staff financial history is protected", () => {
  assert.doesNotMatch(migration, /delete from public\.event_staff_payments[\s\S]*paid_amount\s*>\s*0/i);
  assert.match(migration, /preserv(?:e|es) paid\/finalized staff finance/i);
  assert.doesNotMatch(migration, /delete from public\.timeline_events/i);
});
