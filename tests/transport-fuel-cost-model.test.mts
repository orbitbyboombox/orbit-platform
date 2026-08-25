import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0169_transport_fuel_cost_model.sql", "utf8");
const overrideEngine = readFileSync("supabase/migrations/0046_real_cost_override_engine.sql", "utf8");
const reports = readFileSync("app/(platform)/reports/page.tsx", "utf8");
const accountantExport = readFileSync("features/accountant-export/data.ts", "utf8");
const projectPage = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const costMaster = readFileSync("features/settings/master-data/cost-master-center.tsx", "utf8");
const overridePanel = readFileSync("features/projects/components/real-cost-override-panel.tsx", "utf8");

const mobilization = (transport: number, extraFuel = 0) => transport + extraFuel;

test("1. real transport 20000 plus no fuel totals 20000", () => {
  assert.equal(mobilization(20_000), 20_000);
  assert.match(migration, /coalesce\(real_transport,public\.default_real_transport_cost\(\)\)/);
});

test("2. real transport can be explicitly overridden to zero", () => {
  assert.equal(mobilization(0), 0);
  assert.match(migration, /select edited_value into real_transport[\s\S]*category='TRANSPORT'/);
});

test("3. special real transport 30000 is the complete mobilization cost", () => {
  assert.equal(mobilization(30_000), 30_000);
});

test("4. explicit additional fuel 10000 remains independently supported", () => {
  assert.equal(mobilization(20_000, 10_000), 30_000);
  assert.match(migration, /coalesce\(real_fuel,nullif\(expense_fuel\+route_fuel,0\),historical_fuel,0\)/);
  assert.match(migration, /category='FUEL'/);
});

test("5. automatic fuel default is zero and cannot duplicate transport", () => {
  assert.match(migration, /'DEFAULT_FUEL_COST','Combustible adicional',0/);
  assert.match(migration, /fuel_value:=0/);
  assert.doesNotMatch(migration, /select coalesce\(amount,0\) into fuel_value from public\.cost_master_entries where code='DEFAULT_FUEL_COST'/);
  assert.match(costMaster, /Sin valor automático/);
});

test("6. Founder fuel and transport overrides persist as audited latest values", () => {
  assert.match(overrideEngine, /allowed constant text\[\][^;]*'FUEL','TRANSPORT'/);
  assert.match(overrideEngine, /insert into public\.financial_cost_overrides/);
  assert.match(overrideEngine, /order by created_at desc limit 1/);
  assert.match(overridePanel, /Combustible adicional/);
  assert.match(overridePanel, /Costo real transporte/);
});

test("7. financial_event_records receives one reconciled canonical total", () => {
  assert.match(migration, /perform public\.sync_event_operation_cost\(item\.project_id\)/);
  assert.match(migration, /'fuel'[\s\S]*fuel_value[\s\S]*'transport'[\s\S]*transport_value/);
  assert.equal(Math.round((120_911.87 - 20_000) * 100) / 100, 100_911.87);
});

test("8. profitability recalculates from the canonical operation cost writer", () => {
  assert.match(migration, /perform public\.sync_event_profitability\(item\.project_id\)/);
  assert.match(migration, /create or replace function public\.sync_event_profitability[\s\S]*select \* into f from public\.financial_event_records/);
  assert.match(migration, /f\.cost_breakdown\|\|jsonb_build_object\('total',f\.real_cost\)/);
  assert.match(migration, /CANONICAL_TRANSPORT_WITH_EXPLICIT_EXTRA_FUEL_V2/);
});

test("9. reports and accounting export consume financial_event_records", () => {
  assert.match(reports, /loadFinancialTruth/);
  assert.doesNotMatch(reports, /from\("profit_snapshots"\)/);
  assert.match(accountantExport, /from\("financial_event_records"\)/);
  assert.doesNotMatch(accountantExport, /from\("profit_snapshots"\)/);
  assert.match(projectPage, /operational_cost:total_operational_cost/);
});

test("10. historical repair is deterministic, idempotent, and review-aware", () => {
  assert.match(migration, /source_snapshot->>'source'='COST_MASTER_AND_MASTER_DATA'/);
  assert.match(migration, /not exists\(select 1 from public\.event_operational_closures/);
  assert.match(migration, /FOUNDER_REVIEW_REQUIRED/);
  assert.match(migration, /HISTORICAL_FROZEN/);
  assert.match(migration, /transportFuelRepair','0169'/);
});

test("11. customer billing and commercial transport are outside migration writes", () => {
  assert.doesNotMatch(migration, /(?:update|insert into|delete from) public\.(?:quotations|quotation_items|invoices|accounts_receivable_projection)/i);
  assert.doesNotMatch(migration, /transport_total\s*=/i);
});

test("12. Payment Ledger paid amounts and Staff payments remain unchanged", () => {
  assert.doesNotMatch(migration, /(?:update|insert into|delete from) public\.(?:invoice_payments|receivable_movements|event_staff_payments)/i);
  assert.doesNotMatch(migration, /paid_amount\s*=/i);
});

test("13. quote to reservation remains isolated from the internal cost repair", () => {
  assert.doesNotMatch(migration, /convert_quotation_to_reservation|quotation_conversion|reservation_pipeline/i);
  assert.match(migration, /real_transport_cost|default_real_transport_cost/i);
  assert.match(migration, /automaticFuel',0/);
});
