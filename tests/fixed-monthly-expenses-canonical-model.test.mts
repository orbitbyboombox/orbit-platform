import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateMonthlyOperatingResult,
  summarizeFixedMonthlyExpenses,
  type FixedExpenseRule,
} from "../features/expense-center/fixed-expense-read-model.ts";

const migration = readFileSync(new URL("../supabase/migrations/0148_fixed_monthly_business_expenses.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(platform)/finance/expenses/page.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../features/expense-center/expense-center.tsx", import.meta.url), "utf8");
const asOf = new Date("2026-08-20T12:00:00Z");

const rule = (id: string, name: string, category: string, amount: number, active = true): FixedExpenseRule => ({
  id, name, category, amount, active, currency: "CLP", frequency: "MONTHLY", nextDueDate: "2026-09-01",
  metadata: { costScope: "BUSINESS_OVERHEAD", fixedExpense: true, effectiveStart: "2026-08-01", eventCostImpact: false },
});

const founderRules = [
  rule("dividend", "Dividendo Oficina + Bodega", "INFRASTRUCTURE_OWNED_PROPERTY_DIVIDEND", 505_000),
  rule("common", "Gastos comunes", "FACILITY_COMMON_EXPENSES", 124_000),
  rule("electricity", "Luz", "UTILITIES_ELECTRICITY", 15_000),
  rule("water", "Agua", "UTILITIES_WATER", 6_000),
];

test("gastos fijos Founder totalizan 650.000 mensuales y 7.800.000 anuales", () => {
  const summary = summarizeFixedMonthlyExpenses(founderRules, asOf);
  assert.equal(summary.monthlyTotal, 650_000);
  assert.equal(summary.annualReference, 7_800_000);
});

test("el gasto fijo se suma una vez y no depende de la cantidad de eventos", () => {
  const oneEvent = summarizeFixedMonthlyExpenses(founderRules, asOf).monthlyTotal;
  const oneHundredEvents = summarizeFixedMonthlyExpenses(founderRules, asOf).monthlyTotal;
  assert.equal(oneEvent, oneHundredEvents);
});

test("dividendo de inmueble propio nunca se clasifica como arriendo", () => {
  assert.match(migration, /INFRASTRUCTURE_OWNED_PROPERTY_DIVIDEND/);
  assert.match(migration, /OWNED_PROPERTY/);
  assert.doesNotMatch(migration, /['\"]RENT['\"]/);
});

test("gastos comunes, luz y agua quedan activos en el seed canónico", () => {
  const summary = summarizeFixedMonthlyExpenses(founderRules, asOf);
  assert.deepEqual(summary.items.map((item) => item.name), ["Dividendo Oficina + Bodega", "Gastos comunes", "Luz", "Agua"]);
});

test("gasto fijo permanece separado del costo directo de eventos", () => {
  assert.match(migration, /'eventCostImpact', false/);
  assert.doesNotMatch(migration, /project_id/);
  assert.equal(calculateMonthlyOperatingResult({ realIncome: 2_000_000, directEventCosts: 500_000, fixedMonthlyExpenses: 650_000 }), 850_000);
});

test("gasto inactivo no entra al total", () => {
  const summary = summarizeFixedMonthlyExpenses([...founderRules, rule("inactive", "Inactivo", "OTHER", 999_000, false)], asOf);
  assert.equal(summary.monthlyTotal, 650_000);
});

test("UI consume reglas del read-model y no hardcodea montos Founder", () => {
  assert.match(page, /finance_recurring_expense_rules/);
  assert.match(page, /summarizeFixedMonthlyExpenses/);
  assert.match(ui, /fixedExpenseSummary/);
  for (const amount of ["505000", "124000", "15000", "6000", "650000", "7800000"]) assert.doesNotMatch(ui, new RegExp(amount));
});

test("migración reutiliza motor recurrente y no genera gastos al instalar", () => {
  assert.match(migration, /finance_recurring_expense_rules/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.expenses/i);
  assert.doesNotMatch(migration, /generate_recurring_finance_expenses\s*\(/i);
});
