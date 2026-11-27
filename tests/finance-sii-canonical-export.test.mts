import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const data = readFileSync("features/accountant-export/data.ts", "utf8");
const tributary = readFileSync("app/(platform)/finance/tributary/page.tsx", "utf8");

test("el exportador contable filtra documentos productivos y excluye anulados", () => {
  assert.match(data, /financial_record_state,record_origin/);
  assert.match(data, /activeInvoices=invoices\.filter/);
  assert.match(data, /financial_record_state==="ACTIVE"/);
  assert.match(data, /record_origin==="PRODUCTION"/);
  assert.match(data, /effective_status!=="CANCELLED"/);
});

test("cobranzas exportadas usan el impacto canónico de pagos y reversas", () => {
  assert.match(data, /invoicePaymentCashImpact/);
  assert.match(data, /movement_type,deleted_at/);
  assert.match(data, /const impact=invoicePaymentCashImpact/);
  assert.match(data, /income:impact/);
});

test("gastos QA o de prueba no entran al paquete del contador", () => {
  assert.match(data, /isQaOrTestMarker/);
  assert.match(data, /activeExpenses=/);
});

test("SII conserva modo PRE-SII y el período al volver", () => {
  assert.match(tributary, /PRE-SII · Solo preparación/);
  assert.match(tributary, /href=\{`\/finance\/tributary\?period=\$\{period\}`\}/);
  assert.match(tributary, /No se pudo consultar el resumen tributario/);
});
