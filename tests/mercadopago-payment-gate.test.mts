import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const completion = readFileSync("features/automatic-booking/complete-automatic-booking.service.ts", "utf8");
const experience = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const statusRoute = readFileSync("app/api/booking/[token]/mercadopago/status/route.ts", "utf8");
const confirmRoute = readFileSync("app/api/booking/[token]/confirm/route.ts", "utf8");
const completeRoute = readFileSync("app/api/booking/[token]/mercadopago/complete/route.ts", "utf8");

test("Mercado Pago completion is server-gated by a PAID intent before writes", () => {
  assert.match(completion, /assertMercadoPagoPaymentApproved/);
  assert.match(completion, /intent\.status !== "PAID"/);
  assert.match(completion, /PAYMENT_REQUIRED/);
  const guard = completion.indexOf("if (input.submission.payment.method === \"MERCADO_PAGO\")");
  const claim = completion.indexOf("update({ status: \"PROCESSING\"", guard);
  assert.ok(guard >= 0 && claim >= 0 && guard < claim, "payment guard must run before invitation claim");
});

test("automatic booking returns to a payment verification state and carries provider proof", () => {
  assert.match(experience, /mercadopago\/status\?payment_intent=/);
  assert.match(experience, /paymentVerification/);
  assert.match(experience, /providerPaymentId/);
  assert.match(experience, /Pago aprobado/);
  assert.match(experience, /El pago sigue pendiente/);
  assert.match(statusRoute, /provider_payment_id/);
  assert.match(statusRoute, /external_reference/);
  assert.match(completeRoute, /intent\.submission/);
  assert.match(completeRoute, /status !== "PAID"/);
});

test("confirm endpoint exposes a distinct payment-required response", () => {
  assert.match(confirmRoute, /failure\.code === "PAYMENT_REQUIRED"/);
  assert.match(confirmRoute, /failure\.code === "PAYMENT_REQUIRED" \? 402/);
});
