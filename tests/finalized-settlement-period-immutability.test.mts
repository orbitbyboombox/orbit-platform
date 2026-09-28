import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260928130000_immutable_finalized_settlement_period.sql",
  "utf8",
);

test("recalculation never derives accounting_month from payments or creation time", () => {
  const functionBody = migration.match(
    /create or replace function public\.recalculate_event_staff_settlement[\s\S]*?\$\$;/,
  )?.[0] ?? "";
  assert.match(functionBody, /paid_amount=greatest\(total_paid,0\)/);
  assert.doesNotMatch(functionBody, /accounting_month\s*=/);
  assert.doesNotMatch(functionBody, /settlement_accounting_month/);
});

test("finalized period changes require an explicit audited override", () => {
  assert.match(migration, /orbit\.period_override/);
  assert.match(migration, /orbit\.period_override_reason/);
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /using errcode='42501'/);
  assert.match(migration, /explicitOverride/);
  assert.match(migration, /finalized_snapshot->'details'/);
});

test("repair restores finalized snapshot periods and refreshes only open September accounts", () => {
  assert.match(migration, /min\(account\.accounting_month\) finalized_month/);
  assert.match(migration, /payment\.accounting_month is distinct from finalized_period\.finalized_month/);
  assert.match(migration, /accounting_month='2026-09-01'::date/);
  assert.match(migration, /settlement_status<>'FINALIZED'/);
});
