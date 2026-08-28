import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateMonthlyFinancePerformance } from "../features/finance/finance-performance.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const model = read("features/finance/finance-read-model.ts");
const page = read("app/(platform)/finance/page.tsx");
const founder = read("features/founder-workspace/founder-workspace-experience.tsx");

test("resultado mensual separa Eventos de overhead operativo", () => {
  assert.deepEqual(calculateMonthlyFinancePerformance({ revenue: 1_230_000, directEventCosts: 316_439, fixedMonthlyExpenses: 650_000 }), {
    eventResult: 913_561,
    operatingResult: 263_561,
    eventMargin: (913_561 / 1_230_000) * 100,
    operatingMargin: (263_561 / 1_230_000) * 100,
  });
});

test("Dashboard obtiene overhead desde reglas y no lo resta de caja", () => {
  assert.match(model, /finance_recurring_expense_rules/);
  assert.match(model, /summarizeFixedMonthlyExpenses/);
  assert.match(model, /calculateMonthlyFinancePerformance/);
  assert.match(model, /const availableCash = collectedAll - outgoingAll/);
  assert.doesNotMatch(model, /availableCash\s*=.*fixedMonthlyExpenses/);
});

test("cobrado mensual y acumulado usan cash impact canónico", () => {
  assert.match(model, /client\.rpc\("invoice_payment_cash_impact"/);
  assert.match(model, /collectionsMonth = sum\(monthPayments, \(row\) => row\.cashImpact\)/);
  assert.match(model, /const collectedAll = sum\(canonicalPayments, \(row\) => row\.cashImpact\)/);
});

test("UI separa desempeño mensual de posición global", () => {
  assert.match(page, /title={`Este mes · \$\{data\.periodLabel\}`}/);
  assert.match(page, /title="Posición actual"/);
  assert.match(page, /metrics={data\.month}/);
  assert.match(page, /metrics={data\.position}/);
  assert.match(model, /"Saldos Clientes \/ Eventos"/);
  assert.match(model, /"Crédito Empresas"/);
});

test("Founder Command Center etiqueta período y semántica", () => {
  assert.match(founder, /position\("Caja registrada"\)/);
  assert.match(founder, /month\("Ventas del mes"\)/);
  assert.match(founder, /month\("Resultado operativo"\)/);
  assert.match(founder, /month\("Margen operativo"\)/);
  assert.doesNotMatch(founder, /headline\("Margen"\)/);
});

test("drill-downs canónicos apuntan a sus superficies propietarias", () => {
  assert.match(model, /"Ventas del mes"[\s\S]*"\/projects\?period=month"/);
  assert.match(model, /"Gastos fijos comprometidos"[\s\S]*"\/finance\/expenses"/);
  assert.match(model, /"Crédito Empresas"[\s\S]*"\/finance\/receivables\?category=company-credit"/);
  assert.match(model, /"Saldos Clientes \/ Eventos"[\s\S]*"\/finance\/receivables\?category=ordinary"/);
});
