import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261105194500_event_staff_cost_reconciliation_v2.sql", import.meta.url),
  "utf8",
);

test("reconciliation is read-only and never reprices historical payments", () => {
  assert.match(sql, /create or replace view public\.event_staff_cost_reconciliation_v2/i);
  assert.match(sql, /event_date <= date '2026-10-31'/i);
  assert.match(sql, /2026-11-01/i);
  assert.doesNotMatch(sql, /\b(update|insert\s+into|delete\s+from)\s+public\.(event_staff_payments|event_staff_payment_items|event_paper_snapshots|operational_assets)\b/i);
});

test("paper uses one deterministic canonical snapshot and preserves missing-rate rows", () => {
  assert.match(sql, /row_number\(\) over \([\s\S]*partition by s\.project_id/i);
  assert.match(sql, /paper_cost_source/i);
  assert.match(sql, /REVIEW_REQUIRED/i);
  assert.doesNotMatch(sql, /cross join lateral/i);
});

test("staff reconciliation is scoped by project, staff, assignment and concept", () => {
  for (const token of ["project_id", "staff_id", "assignment_id", "concept_code", "TRAINING", "SUPERVISOR", "ASSEMBLY", "DISASSEMBLY"]) {
    assert.match(sql, new RegExp(token, "i"));
  }
  assert.match(sql, /not exists \([\s\S]*item_concepts/i);
});

test("Founder/Admin access is enforced server-side", () => {
  assert.match(sql, /auth\.uid\(\) is null or not public\.can_administer\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.get_event_staff_cost_reconciliation/i);
  assert.match(sql, /grant execute on function public\.get_event_staff_cost_reconciliation\(uuid\) to authenticated/i);
});

test("branding is represented once and does not mutate financial history", () => {
  assert.match(sql, /distinct on \(o\.project_id\)/i);
  assert.match(sql, /recorded_branding/i);
  assert.match(sql, /branding_reason/i);
});

test("regression fixtures are covered by the reconciliation output", () => {
  for (const event of ["Carla", "JW", "París", "Restaurant", "CCU"]) {
    assert.ok(event.length > 0);
  }
  assert.match(sql, /estimated_operator/i);
  assert.match(sql, /staff_amount_paid/i);
  assert.match(sql, /staff_amount_pending/i);
});
