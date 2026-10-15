import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateInvoiceTotals } from "../features/expense-center/invoice-totals.ts";

const ui = readFileSync(new URL("../features/expense-center/expense-center.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../features/expense-center/actions.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../features/founder-workspace/founder-workspace-experience.tsx", import.meta.url), "utf8");

test("calcula IVA chileno redondeado y total en pesos", () => {
  assert.deepEqual(calculateInvoiceTotals(465_000), { net: 465_000, vat: 88_350, exempt: 0, total: 553_350 });
  assert.equal(calculateInvoiceTotals(1).vat, 0);
  assert.equal(calculateInvoiceTotals(99).vat, 19);
});

test("las facturas nuevas calculan IVA en servidor y no dependen del navegador", () => {
  assert.match(actions, /documentType===\"INVOICE\"&&!id/);
  assert.match(actions, /calculateInvoiceTotals\(subtotal,exempt\)/);
  assert.match(ui, /Calculado automáticamente y redondeado a pesos/);
});

test("las facturas existentes conservan sus valores salvo corrección explícita", () => {
  assert.match(actions, /storedInvoice=Boolean\(id&&documentType===\"INVOICE\"&&previous\?\.data\?\.document_type===\"INVOICE\"\)/);
  assert.match(actions, /PRESERVE_REGISTERED/);
  assert.match(ui, /Corrección histórica \/ caso especial/);
});

test("la barra superior de pendientes no se renderiza en Dashboard", () => {
  assert.match(dashboard, /DASHBOARD_HEADER.*content: welcome/);
  assert.doesNotMatch(dashboard, /DASHBOARD_HEADER.*compactSummary/);
});
