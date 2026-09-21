import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { calculateMercadoPagoAmounts, canonicalMercadoPagoMode, mapMercadoPagoStatus, verifyMercadoPagoSignature } from "../features/payments/mercadopago/mercadopago.service.ts";

test("Mercado Pago fee is deterministic in CLP", () => {
  assert.deepEqual(calculateMercadoPagoAmounts(100_000), { subtotal: 100_000, fee: 5_000, total: 105_000 });
  assert.deepEqual(calculateMercadoPagoAmounts(305_000), { subtotal: 305_000, fee: 15_250, total: 320_250 });
});

test("Mercado Pago status mapping is canonical", () => {
  assert.equal(mapMercadoPagoStatus("approved"), "PAID");
  assert.equal(mapMercadoPagoStatus("in_process"), "PENDING");
  assert.equal(mapMercadoPagoStatus("rejected"), "FAILED");
  assert.equal(mapMercadoPagoStatus("refunded"), "REFUNDED");
  assert.equal(mapMercadoPagoStatus("charged_back"), "CHARGEBACK");
});

test("webhook signature accepts valid manifest and rejects tampering", () => {
  const secret = "sandbox-secret";
  const ts = 1_700_000_000;
  const dataId = "12345";
  const requestId = "request-1";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
  const base = { signature, requestId, dataId, secret, nowSeconds: ts };
  assert.equal(verifyMercadoPagoSignature(base), true);
  assert.equal(verifyMercadoPagoSignature({ ...base, dataId: "tampered" }), false);
  assert.equal(verifyMercadoPagoSignature({ ...base, signature: "ts=1,v1=bad" }), false);
});

test("production mode is canonical and never exposes credentials", () => {
  assert.equal(canonicalMercadoPagoMode("production"), "PRODUCTION");
  assert.equal(canonicalMercadoPagoMode("TEST"), "TEST");
  assert.equal(canonicalMercadoPagoMode("sandbox"), "INVALID");
});
