import test from "node:test";
import assert from "node:assert/strict";
import { resolveD10CollectionEligibility } from "../../features/accounts-receivable/d10-collection-policy.ts";

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
