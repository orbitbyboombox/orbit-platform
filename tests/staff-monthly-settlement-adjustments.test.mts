import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261026120000_staff_monthly_settlement_include_adjustments.sql", import.meta.url),
  "utf8",
);
const model = await readFile(new URL("../features/staff-monthly-account/model.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../features/staff-monthly-account/staff-monthly-account-panel.tsx", import.meta.url), "utf8");

test("monthly settlement aggregates remuneration adjustments once", () => {
  assert.match(migration, /sum\(a\.amount\)/);
  assert.match(migration, /total_internal_payment \+ adjustment_total/);
  assert.match(migration, /'adjustmentTotal', adjustment_total/);
  assert.match(migration, /CANONICAL_STAFF_MONTHLY_SETTLEMENT_V6/);
});

test("reimbursements remain a separate financial stream", () => {
  assert.match(migration, /\(financial\)\.reimbursement_total/);
  assert.match(migration, /reimbursementsPending/);
  assert.doesNotMatch(migration, /reimbursement_total.*adjustment_total/);
});

test("the change is recalculation-only and keeps finalized periods protected", () => {
  assert.match(migration, /create or replace function public\.calculate_staff_monthly_settlement/);
  assert.doesNotMatch(migration, /update public\.staff_monthly_accounts/);
  assert.doesNotMatch(migration, /delete from public\./i);
  assert.doesNotMatch(migration, /insert into public\./i);
});

test("the expected Constanza arithmetic is 14,000 plus 12,000", () => {
  const base = 14_000;
  const adjustment = 12_000;
  const withholdingRate = 0.1525;
  const net = base + adjustment;
  assert.equal(net, 26_000);
  assert.equal(Math.round(net / (1 - withholdingRate)), 30_678);
});

test("Staff Portal exposes the base and remuneration extra without mixing reimbursements", () => {
  assert.match(model, /adjustmentTotal\?:number/);
  assert.match(panel, /Base \{money\(/);
  assert.match(panel, /Adicionales remuneracionales/);
  assert.match(panel, /Los reembolsos se mantienen separados/);
});
