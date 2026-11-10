import test from "node:test";
import assert from "node:assert/strict";
import { resolveD10CollectionEligibility } from "../../features/accounts-receivable/d10-collection-policy.ts";
import { selectD10CollectibleInvoices } from "../../features/accounts-receivable/d10-invoice-summary.ts";

test("permite cobranza D-10 cuando vence antes del evento", () => {
  assert.deepEqual(resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-11-20", outstandingBalance: 1000, recipient: "cliente@example.com" }), { eligible: true, reason: "ELIGIBLE" });
});

test("excluye empresa con vencimiento posterior al evento", () => {
  assert.deepEqual(resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-12-20", outstandingBalance: 1000, recipient: "cliente@example.com" }), { eligible: false, reason: "NOT_DUE_BEFORE_EVENT" });
});

test("no envía saldo cero ni inventa cobranza", () => {
  assert.deepEqual(resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-11-20", outstandingBalance: 0, recipient: "cliente@example.com" }), { eligible: false, reason: "PAID" });
});

test("requiere revisión si falta vencimiento o destinatario", () => {
  assert.equal(resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: null, outstandingBalance: 1000, recipient: "cliente@example.com" }).reason, "MISSING_DUE_DATE");
  assert.equal(resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-11-20", outstandingBalance: 1000, recipient: null }).reason, "MISSING_RECIPIENT");
});

test("mantiene la cobranza fuera de D-10 cuando una reprogramación cambia la fecha del evento", () => {
  const original = resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-11-20", outstandingBalance: 1000, recipient: "cliente@example.com" });
  const rescheduled = resolveD10CollectionEligibility({ eventDate: "2026-12-05", dueDate: "2026-11-20", outstandingBalance: 1000, recipient: "cliente@example.com" });
  assert.equal(original.reason, "ELIGIBLE");
  assert.equal(rescheduled.reason, "ELIGIBLE");
});

test("mantiene pendiente un saldo positivo con plazo posterior, sin enviar cobranza anticipada", () => {
  const result = resolveD10CollectionEligibility({ eventDate: "2026-11-20", dueDate: "2026-12-20", outstandingBalance: 5000, recipient: "empresa@example.com" });
  assert.deepEqual(result, { eligible: false, reason: "NOT_DUE_BEFORE_EVENT" });
});

test("D-10 cobra saldos parciales vencibles y excluye facturas posteriores al evento", () => {
  const selected = selectD10CollectibleInvoices([
    { id: "partial", status: "PARTIALLY_PAID", amount: 100000, paid_amount: 20000, outstanding_balance: 80000, due_date: "2026-11-20" },
    { id: "future", status: "ISSUED", amount: 50000, paid_amount: 0, outstanding_balance: 50000, due_date: "2026-12-20" },
    { id: "paid", status: "PAID", amount: 25000, paid_amount: 25000, outstanding_balance: 0, due_date: "2026-11-15" },
    { id: "missing-date", status: "ISSUED", amount: 20000, paid_amount: 0, outstanding_balance: 20000, due_date: null },
  ], "2026-11-20");
  assert.deepEqual(selected.map((item) => item.id), ["partial"]);
});

test("rechaza la selección si el saldo canónico es inválido o mezcla monedas", () => {
  assert.deepEqual(selectD10CollectibleInvoices([
    { id: "bad", amount: 100, paid_amount: 0, outstanding_balance: null, due_date: "2026-11-20" },
  ], "2026-11-20"), []);
  assert.deepEqual(selectD10CollectibleInvoices([
    { id: "clp", amount: 100, paid_amount: 0, outstanding_balance: 100, due_date: "2026-11-20", currency: "CLP" },
    { id: "usd", amount: 100, paid_amount: 0, outstanding_balance: 100, due_date: "2026-11-20", currency: "USD" },
  ], "2026-11-20"), []);
});
