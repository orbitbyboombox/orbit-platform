import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const guardMigration = readFileSync(
  "supabase/migrations/20260927190000_guard_finalized_settlement_period_changes.sql",
  "utf8",
);

const augustSettlements = [
  "863953b5-f2b5-46b3-a599-fc274a1c03ee",
  "b2ac4f98-5465-487e-9fd3-92529d39fd6f",
  "ea2deaf8-6f50-4bcd-aafe-593788a68343",
];

test("José Rodríguez correction targets only the three August settlements", () => {
  assert.equal(augustSettlements.length, 3);
  assert.ok(augustSettlements.every((settlementId) => /^[0-9a-f-]{36}$/.test(settlementId)));
  assert.match(guardMigration, /accounting_month is distinct from new\.accounting_month/);
  assert.match(guardMigration, /settlement_status='FINALIZED'/);
  assert.match(guardMigration, /Cambio autorizado de período/);
});

test("finalized-period guard requires administrative authorization and records an audit trail", () => {
  assert.match(guardMigration, /using errcode='42501'/);
  assert.match(guardMigration, /public\.can_administer\(\)/);
  assert.match(guardMigration, /staff_monthly_settlement_audit/);
  assert.match(guardMigration, /guard_finalized_settlement_period_change/);
});
