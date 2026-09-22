import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { automaticBookingStepIssues } from "../features/automatic-booking/automatic-booking-validation.ts";

const completion = readFileSync("features/automatic-booking/complete-automatic-booking.service.ts", "utf8");
const experience = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const statusRoute = readFileSync("app/api/booking/[token]/mercadopago/status/route.ts", "utf8");
const confirmRoute = readFileSync("app/api/booking/[token]/confirm/route.ts", "utf8");
const completeRoute = readFileSync("app/api/booking/[token]/mercadopago/complete/route.ts", "utf8");
const validation = readFileSync("features/automatic-booking/automatic-booking-validation.ts", "utf8");

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

test("receipt gate is specific to Transfer and cannot disable Mercado Pago", () => {
  assert.match(validation, /input\.payment\.method !== "MERCADO_PAGO"/);
  assert.match(validation, /input\.payment\.method !== "MERCADO_PAGO"[\s\S]*!input\.payment\.receiptBase64/);
  assert.match(experience, /payment\.method==="MERCADO_PAGO"\?\<Button disabled=\{!canConfirm/);
  assert.match(experience, /payment\.method==="TRANSFER"&&/);
});

test("Mercado Pago UI does not render the transfer receipt component", () => {
  assert.match(experience, /payment\.method==="TRANSFER"&&\<\>\<BankDetails/);
  assert.match(experience, /Adjuntar comprobante de transferencia/);
  assert.match(experience, /Serás redirigido a Mercado Pago para completar el pago de forma segura/);
});

const paymentGateInput = (method: "TRANSFER" | "MERCADO_PAGO", receiptBase64 = "") => automaticBookingStepIssues({
  step: 4,
  customer: { name: "QA", rut: "12.345.678-5", phone: "+56912345678" },
  event: { date: "2027-01-01", time: "18:00", venue: "QA", address: "QA", municipality: "Santiago", operationalContact: "QA", operationalPhone: "+56912345678" },
  service: { code: "CLASSIC", total: 100000 },
  contract: { termsRead: true, termsAccepted: true, signature: "data:image/png;base64,qa" },
  payment: { method, receiptBase64 },
  validMunicipality: true,
});

test("Transfer requires a receipt while Mercado Pago does not", () => {
  assert.ok(paymentGateInput("TRANSFER").includes("Adjunta el comprobante de pago."));
  assert.deepEqual(paymentGateInput("MERCADO_PAGO"), []);
  assert.deepEqual(paymentGateInput("TRANSFER", "data:image/png;base64,receipt"), []);
});
