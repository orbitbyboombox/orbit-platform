import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0149_event_profitability_single_source_of_truth.sql", "utf8");

test("0149 establishes one canonical event-cost calculation path", () => {
  assert.match(migration, /create or replace function public\.calculate_event_operation_cost\(p_project_id uuid\)/i);
  assert.match(migration, /create or replace function public\.sync_event_operation_cost\(p_project_id uuid\)[\s\S]*calculate_event_operation_cost\(p_project_id\)/i);
  const legacy = migration.match(/create or replace function public\.sync_financial_event\(p_project_id uuid\)[\s\S]*?end \$\$;/i)?.[0] ?? "";
  assert.match(legacy, /perform public\.sync_event_operation_cost\(p_project_id\)/i);
  assert.doesNotMatch(legacy, /effective_cost|payroll_cost|route_fuel|inventory_cost/i);
});

test("canonical writer updates every profitability field atomically", () => {
  for (const field of ["personnel_cost", "operational_resources_cost", "total_operational_cost", "real_cost", "gross_profit", "net_profit", "gross_margin", "net_margin", "cost_breakdown"]) {
    assert.match(migration, new RegExp(`${field}\\s*=`));
  }
  assert.match(migration, /real_cost=snapshot\.total_operational_cost/);
  assert.match(migration, /profit_value:=revenue_value-snapshot\.total_operational_cost/);
  assert.match(migration, /revenue_value>0 then profit_value\/revenue_value\*100/);
});

test("breakdown contains only sourced monetary lines and reconciles to direct cost", () => {
  for (const key of ["operator", "assembly", "disassembly", "staffAdjustments", "staffTax", "paper", "fuel", "transport", "scrapbook", "magnets", "branding", "pens", "doubleSidedTape", "registeredExpenses", "other"]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /event_cost_breakdown_total\(c\.cost_breakdown\)<>c\.total_operational_cost/);
  assert.doesNotMatch(migration, /Otros costos considerados por el motor/);
});

test("Automotriz canonical regression excludes VAT, cash collection and overhead", () => {
  const operator = 14_000, assembly = 7_500, disassembly = 7_500;
  const staffNet = operator + assembly + disassembly;
  const staff = Math.round((staffNet / (1 - 0.1525)) * 100) / 100;
  const resources = 22_371.432 + 20_000 + 17_000 + 1_750 + 666.6667;
  const realCost = staff + resources;
  const netRevenue = 476_000 - 76_000;
  const profit = netRevenue - realCost;
  const margin = profit / netRevenue * 100;
  assert.ok(Math.abs(realCost - 96_006.3887) < 0.01);
  assert.ok(Math.abs(profit - 303_993.6113) < 0.01);
  assert.ok(Math.abs(margin - 75.998402825) < 0.0001);
  assert.doesNotMatch(migration, /finance_recurring_expense_rules|invoice_payments\.amount|outstanding_balance\s*[+-]/i);
});

test("preview is read-only and controlled repair is explicit and idempotent", () => {
  const preview = migration.match(/create or replace function public\.preview_event_profitability_repair[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(preview, /language sql stable security definer/i);
  assert.doesNotMatch(preview, /\b(update|insert|delete)\b/i);
  assert.match(migration, /execute_event_profitability_repair\(p_project_ids uuid\[\] default null,p_dry_run boolean default true\)/i);
  assert.match(migration, /if not coalesce\(p_dry_run,true\) then perform public\.sync_event_operation_cost/);
  assert.doesNotMatch(migration, /select public\.execute_event_profitability_repair|perform public\.execute_event_profitability_repair/i);
  assert.match(migration, /can_administer\(\)/);
  assert.match(migration, /auth\.role\(\)='service_role'/);
});

test("0149 installation performs no historical repair or financial data write", () => {
  const topLevel = migration.replace(/\$\$[\s\S]*?\$\$/g, "FUNCTION_BODY");
  assert.doesNotMatch(topLevel, /\b(update|insert into|delete from)\s+public\.(financial_event_records|invoices|invoice_payments|receivable_movements)/i);
});
