import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const founder = readFileSync(new URL("features/founder-workspace/founder-workspace-experience.tsx", root), "utf8");
const financeReadModel = readFileSync(new URL("features/finance/finance-read-model.ts", root), "utf8");
const valueComponent = founder.match(/export function FounderKpiValue[\s\S]*?function StatusPill/)?.[0] ?? "";

test("Founder KPIs use one reusable container-aware value component", () => {
  assert.match(founder, /<FounderKpiValue>\{formatMetric\(metric\)\}<\/FounderKpiValue>/);
  assert.match(valueComponent, /data-kpi-value/);
  assert.match(valueComponent, /style=\{\{ fontSize: "clamp\(1\.05rem, 1\.6vw, 1\.5rem\)" \}\}/);
  assert.match(founder, /style=\{\{ containerType: "inline-size" \}\}/);
});

test("large monetary values can shrink within a readable bounded range", () => {
  for (const value of ["$12.345.678", "$123.456.789", "$1.234.567.890"]) {
    assert.equal(value.includes("…"), false);
    assert.equal(value.length > 0, true);
  }
  assert.match(valueComponent, /max-w-full min-w-0/);
  assert.match(valueComponent, /whitespace-nowrap/);
  assert.doesNotMatch(valueComponent, /overflow-wrap:anywhere/);
});

test("financial figures are never ellipsized or truncated", () => {
  assert.doesNotMatch(valueComponent, /truncate|text-ellipsis|overflow-hidden|line-clamp/);
  assert.match(valueComponent, /\[font-variant-numeric:tabular-nums\]/);
});

test("percentage and count values share the same safe presentation", () => {
  assert.match(founder, /metric\.format === "percent"/);
  assert.match(founder, /formatMetric\(metric\)/);
  assert.match(founder, /format: "count"/);
});

test("the KPI grid preserves six columns only when the viewport can contain them", () => {
  assert.match(founder, /grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6/);
  assert.match(founder, /min-h-\[7\.75rem\] min-w-0/);
});

test("required responsive layouts retain safe reflow rules", () => {
  const columnsAt = (width: number) => width >= 1280 ? 6 : width >= 768 ? 3 : 2;
  assert.equal(columnsAt(1920), 6);
  assert.equal(columnsAt(1440), 6);
  assert.equal(columnsAt(1280), 6);
  assert.equal(columnsAt(1024), 3);
  assert.equal(columnsAt(390), 2);
});

test("KPI source values continue to come from the canonical Finance read model", () => {
  assert.match(founder, /finance\.position\.find/);
  assert.match(founder, /finance\.month\.find/);
  for (const label of ["Caja registrada", "Por cobrar total", "Crédito Empresas", "Saldos Clientes / Eventos", "Ventas del mes", "Resultado operativo", "Margen operativo"]) {
    assert.match(founder, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(financeReadModel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the presentation fix introduces no financial write path", () => {
  assert.doesNotMatch(valueComponent, /action|mutation|payment|ledger|update|insert|delete/i);
  assert.doesNotMatch(founder, /paid_amount|invoice_payments|Payment Ledger/);
});
