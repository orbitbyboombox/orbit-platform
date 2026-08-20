import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync("features/crm/customer-operations.repository.ts", "utf8");
const ui = readFileSync("features/crm/customer-event-operations.tsx", "utf8");

test("event cost UI consumes only financial_event_records", () => {
  assert.match(repository, /from\("financial_event_records"\)/);
  assert.doesNotMatch(repository, /event_profitability_statements/);
  assert.match(repository, /truth\.personnel_cost/);
  assert.match(repository, /truth\.operational_resources_cost/);
  assert.match(repository, /truth\.total_operational_cost/);
  assert.match(repository, /truth\.net_profit/);
  assert.match(repository, /truth\.net_margin/);
});

test("canonical breakdown lines are the only visible monetary detail", () => {
  for (const key of ["operator", "assembly", "disassembly", "staffAdjustments", "staffTax", "paper", "fuel", "transport", "scrapbook", "magnets", "branding", "pens", "doubleSidedTape", "registeredExpenses", "other"]) {
    assert.match(repository, new RegExp(`\\[\"${key}\"`));
  }
  const costDetail = ui.match(/function CostDetail[\s\S]*?\n}\nfunction profitabilityLabel/)?.[0] ?? "";
  assert.ok(costDetail);
  assert.doesNotMatch(costDetail, /Otros costos considerados por el motor|reconciliation|listedTotal/);
});

test("Automotriz canonical values reconcile without an artificial residual", () => {
  const personnel = 14_000 + 7_500 + 7_500 + 5_218.29;
  const resources = 22_371.43 + 20_000 + 17_000 + 1_750 + 666.67;
  const realCost = personnel + resources;
  const profit = 400_000 - realCost;
  const margin = profit / 400_000 * 100;
  assert.equal(personnel, 34_218.29);
  assert.equal(resources, 61_788.1);
  assert.equal(realCost, 96_006.39);
  assert.equal(profit, 303_993.61);
  assert.ok(Math.abs(margin - 75.9984) < 0.0001);
});

test("profitability read model cannot write financial data", () => {
  assert.doesNotMatch(repository, /\.from\("(?:invoices|invoice_payments|receivable_movements|accounts_receivable_projection)"\)\.(?:insert|update|delete|upsert)/);
});
