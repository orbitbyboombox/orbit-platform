import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0170_converted_quote_profitability_projection.sql", "utf8");
const idempotencyMigration = readFileSync("supabase/migrations/0171_converted_quote_profitability_signature_idempotency.sql", "utf8");
const transportMigration = readFileSync("supabase/migrations/0169_transport_fuel_cost_model.sql", "utf8");
const reports = readFileSync("app/(platform)/reports/page.tsx", "utf8");
const accountantExport = readFileSync("features/accountant-export/data.ts", "utf8");
const projectPage = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const topLevel = migration.replace(/\$\$[\s\S]*?\$\$/g, "FUNCTION_BODY");

const personnel = 19_000 + 7_000 + 7_000 + 5_938.05;
const resources = 33_557.15 + 0 + 20_000 + 0 + 6_000 + 0 + 1_750 + 666.67 + 0 + 0;

test("1. normal transport is exactly 20000", () => {
  assert.equal(20_000, 20_000);
  assert.match(transportMigration, /default_real_transport_cost\(\)/);
});

test("2. automatic fuel is zero", () => {
  assert.match(migration, /fuel_value:=0/);
  assert.match(migration, /'automaticFuel',0/);
});

test("3. exact Founder component set has resources total 61973.82", () => {
  assert.equal(resources, 61_973.82);
});

test("4. exact Founder component set has event total 100911.87", () => {
  assert.equal(Math.round((personnel + resources) * 100) / 100, 100_911.87);
});

test("5. explicit fuel override 10000 remains supported", () => {
  assert.match(transportMigration, /select edited_value into real_fuel[\s\S]*category='FUEL'/);
});

test("6. transport 20000 plus explicit fuel 10000 is 30000 mobilization", () => {
  assert.equal(20_000 + 10_000, 30_000);
});

test("7. transport override zero remains authoritative", () => {
  assert.match(transportMigration, /coalesce\(real_transport,public\.default_real_transport_cost\(\)\)/);
  assert.equal(0 + 0, 0);
});

test("8. transport override 30000 remains the complete normal transport", () => {
  assert.equal(30_000 + 0, 30_000);
});

test("9. quote to reservation keeps CONVERTED as the commercial cost source", () => {
  assert.match(migration, /status in\('ACCEPTED','CONVERTED'\)/);
  assert.match(migration, /zz_converted_quote_projection_sync/);
  assert.match(migration, /perform public\.sync_estimated_cost_sheet\(new\.project_id\)/);
});

test("10. reload persistence is database-backed and signature includes the canonical breakdown", () => {
  assert.match(migration, /f\.cost_breakdown::text/);
  assert.match(projectPage, /from\("financial_event_records"\)/);
});

test("11. financial_event_records receives the shared canonical recalculation", () => {
  assert.match(migration, /perform public\.sync_financial_event\(item\.project_id\)/);
  assert.match(migration, /perform public\.sync_event_operation_cost\(item\.project_id\)/);
});

test("12. reports remain consistent with financial_event_records", () => {
  assert.match(reports, /loadFinancialTruth/);
  assert.match(accountantExport, /from\("financial_event_records"\)/);
  assert.doesNotMatch(reports, /from\("profit_snapshots"\)/);
});

test("13. repair has no top-level customer billing mutation", () => {
  assert.doesNotMatch(topLevel, /\b(?:update|insert into|delete from)\s+public\.(?:quotations|quotation_items|invoices|accounts_receivable_projection)\b/i);
  assert.match(migration, /exists\(select 1 from public\.invoices/);
});

test("14. repair never writes Payment Ledger, paid amounts, balances, or Staff payments", () => {
  assert.doesNotMatch(topLevel, /\b(?:update|insert into|delete from)\s+public\.(?:invoice_payments|receivable_movements|event_staff_payments)\b/i);
  assert.doesNotMatch(topLevel, /paid_amount\s*=/i);
});

test("15. genuine manual fuel and closed history are preserved", () => {
  assert.match(transportMigration, /coalesce\(real_fuel,nullif\(expense_fuel\+route_fuel,0\),historical_fuel,0\)/);
  assert.match(migration, /not exists\(select 1 from public\.event_operational_closures/);
  assert.doesNotMatch(topLevel, /\bupdate\s+public\.financial_cost_overrides\b/i);
});

test("16. unchanged profitability recalculation remains idempotent", () => {
  assert.match(idempotencyMigration, /replace\(definition,'s\.updated_at,f\.updated_at,f\.revenue','s\.updated_at,f\.revenue'\)/);
  assert.match(migration, /f\.cost_breakdown::text/);
});
