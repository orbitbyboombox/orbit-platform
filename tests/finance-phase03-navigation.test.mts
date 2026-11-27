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
