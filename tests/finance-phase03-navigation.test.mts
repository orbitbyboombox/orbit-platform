import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("el centro financiero conserva período al navegar a sus módulos", () => {
  const center = read("features/finance/components/finance-premium-center.tsx");
  const tabs = read("features/finance/components/finance-tabs.tsx");
  assert.match(center, /aria-label=\"Período financiero\"/);
  assert.match(center, /withPeriod\(access\.href, period\)/);
  assert.match(center, /withPeriod\(typed\?\.href/);
  assert.match(tabs, /useSearchParams/);
  assert.match(tabs, /withPeriod\(href\)/);
});

test("los indicadores secundarios se agrupan sin duplicar cálculos financieros", () => {
  const center = read("features/finance/components/finance-premium-center.tsx");
  const page = read("app/(platform)/finance/page.tsx");
  for (const label of ["Caja registrada y cuentas", "Cobranza y obligaciones", "Proyección a 30 días", "Resultado operativo y Staff", "Alertas y riesgos financieros"]) assert.match(center, new RegExp(label));
  assert.match(center, /cash\.accounts/);
  assert.match(center, /risks\.map/);
  assert.match(page, /forecast={data\.forecast}/);
  assert.match(page, /cash={data\.cash}/);
});

test("caja separa cobro operacional de garantías de arriendo", () => {
  const model = read("features/finance/finance-read-model.ts");
  const center = read("features/finance/components/finance-premium-center.tsx");
  assert.match(model, /officeGuaranteeIncome/);
  assert.match(model, /nonOperatingIncome: officeGuaranteeIncome/);
  assert.match(center, /Garantías de arriendo · no operacional/);
  assert.match(center, /Cobrado operacional/);
});

test("el KPI de gastos identifica que representa egresos pagados", () => {
  const center = read("features/finance/components/finance-premium-center.tsx");
  assert.match(center, /label: "Egresos pagados del mes"/);
});

test("ventas y AR explicitan alcances financieros distintos", () => {
  const model = read("features/finance/finance-read-model.ts");
  assert.match(model, /ingreso neto sin IVA para rentabilidad; no reemplaza la facturación AR/);
  assert.match(model, /Caja cobrada acumulada/);
});

test("el dashboard acepta mes o año y usa el rango canónico", () => {
  const page = read("app/(platform)/finance/page.tsx");
  const model = read("features/finance/finance-read-model.ts");
  assert.match(page, /params\?\.period/);
  assert.match(model, /resolvePeriod/);
  assert.match(model, /selectedPeriod\.from/);
  assert.match(model, /selectedPeriod\.to/);
  assert.match(model, /accountingMonthInRange/);
});

test("ingresos muestra estados en español y no recalcula saldo pendiente", () => {
  const income = read("features/finance/components/finance-income-center.tsx");
  assert.match(income, /statusLabels/);
  assert.match(income, /Saldo pendiente canónico/);
  assert.match(income, /item\.outstandingBalance/);
  assert.doesNotMatch(income, /Math\.max\(0, total - collected\)/);
  assert.match(income, /detailHref/);
});
