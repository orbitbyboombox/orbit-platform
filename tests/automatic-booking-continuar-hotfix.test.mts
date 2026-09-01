import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { automaticBookingStepIssues } from "../features/automatic-booking/automatic-booking-validation.ts";
import { formatChileanRut } from "../lib/chile/rut.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const experience = source("features/automatic-booking/automatic-booking-experience.tsx");
const page = source("app/booking/[token]/page.tsx");
const service = source("features/automatic-booking/complete-automatic-booking.service.ts");
const validation = source("features/automatic-booking/automatic-booking-validation.ts");

const validInput = (step = 0) => ({
  step,
  customer: { name: "Cliente Prueba", rut: "12.345.678-5", phone: "+56912345678" },
  event: {
    date: "2026-12-12",
    time: "18:00",
    venue: "Centro de eventos",
    address: "Av. Siempre Viva 123",
    municipality: "Las Condes",
    operationalContact: "Contacto Prueba",
    operationalPhone: "+56987654321",
  },
  service: { code: "CLASSIC", total: 300_000 },
  contract: { termsRead: true, termsAccepted: true, signature: "data:image/png;base64,abc" },
  payment: { receiptBase64: "receipt" },
  validMunicipality: true,
});

test("Matrimonio customer form loads through the tokenized public route", () => {
  assert.match(page, /loadAutomaticBookingInvitation\(token\)/);
  assert.match(page, /<AutomaticBookingExperience/);
});

test("required visible personal fields are validated", () => {
  const input = validInput(0);
  input.customer = { name: "", rut: "", phone: "+569" };
  assert.deepEqual(automaticBookingStepIssues(input), [
    "Completa tu nombre y apellido.",
    "Ingresa un RUT válido.",
    "Ingresa un teléfono válido de 8 dígitos.",
  ]);
});

test("optional customer address does not block CONTINUAR", () => {
  assert.deepEqual(automaticBookingStepIssues(validInput(0)), []);
  assert.match(experience, /Dirección \(opcional\)/);
});

test("hidden or unrelated values cannot block the active step", () => {
  const input = { ...validInput(0), hiddenWeddingField: "" };
  assert.deepEqual(automaticBookingStepIssues(input), []);
});

test("formatted valid Chilean RUT enables the personal-data step", () => {
  const input = validInput(0);
  input.customer.rut = formatChileanRut("12345678-5");
  assert.equal(input.customer.rut, "12.345.678-5");
  assert.deepEqual(automaticBookingStepIssues(input), []);
});

test("a missing required field keeps progression blocked", () => {
  const input = validInput(1);
  input.event.operationalContact = "";
  assert.deepEqual(automaticBookingStepIssues(input), ["Completa el contacto operacional."]);
});

test("the customer sees the exact reason CONTINUAR is blocked", () => {
  assert.match(experience, /Para continuar:/);
  assert.match(experience, /aria-live="polite"/);
  assert.match(experience, /role="status"/);
});

test("changing an invalid RUT to valid updates validation immediately", () => {
  const input = validInput(0);
  input.customer.rut = "11.111.111-2";
  assert.deepEqual(automaticBookingStepIssues(input), ["Ingresa un RUT válido."]);
  input.customer.rut = "12.345.678-5";
  assert.deepEqual(automaticBookingStepIssues(input), []);
});

test("mobile phone completion uses the same immediate predicate", () => {
  const input = validInput(0);
  input.customer.phone = "+5691234567";
  assert.deepEqual(automaticBookingStepIssues(input), ["Ingresa un teléfono válido de 8 dígitos."]);
  input.customer.phone = "+56912345678";
  assert.deepEqual(automaticBookingStepIssues(input), []);
});

test("pasted or autofilled formatted RUT uses canonical validation", () => {
  const input = validInput(0);
  for (const rut of ["12345678-5", "12.345.678-5"]) {
    input.customer.rut = formatChileanRut(rut);
    assert.deepEqual(automaticBookingStepIssues(input), []);
  }
});

test("customer token is preserved from page load through confirmation", () => {
  assert.match(page, /params: Promise<\{ token: string \}>/);
  assert.match(experience, /`\/api\/booking\/\$\{encodeURIComponent\(token\)\}\/confirm`/);
});

test("valid CONTINUAR opens the next step without submission", () => {
  assert.match(experience, /disabled=\{!valid\}/);
  assert.match(experience, /setStep\(current=>current\+1\)/);
});

test("confirmation remains protected against repeated submission", () => {
  assert.match(experience, /disabled=\{!valid\|\|pending\}/);
  assert.match(experience, /setPending\(true\)/);
});

test("Matrimonio and other event types share one validation implementation", () => {
  assert.doesNotMatch(validation, /Wedding|Corporate|Birthday|customerName|token/);
  assert.match(experience, /automaticBookingStepIssues/);
});

test("server validation accepts canonical formatted RUT and financial logic is untouched", () => {
  assert.match(service, /isValidChileanRut\(input\.customer\.rut\)/);
  assert.doesNotMatch(service, /\^\[0-9\]\{7,8\}-\[0-9K\]/);
  assert.doesNotMatch(validation, /finance|paymentMethod|reservationAmount|balance/i);
});
