import assert from "node:assert/strict";
import test from "node:test";
import { detectBiancaIntents } from "../features/connectors/whatsapp-cloud/bianca-intent-engine.ts";
import { planBiancaTurn } from "../features/connectors/whatsapp-cloud/bianca-commercial-planner.ts";
import { assertBiancaClaims } from "../features/connectors/whatsapp-cloud/bianca-claim-guards.ts";
import { executeBiancaFullFunnel, executeBiancaFullFunnelSafely } from "../features/connectors/whatsapp-cloud/bianca-full-funnel.ts";
import { biancaQuoteFingerprint } from "../features/connectors/whatsapp-cloud/bianca-quote-fingerprint.ts";

const input = {
  quote: { draft: {} as never, customerId: "customer-test", conversationId: "conversation-test", opportunityId: "opportunity-test", normalizedInputHash: "quote-fingerprint-1" },
  email: { customerId: "customer-test", conversationId: "conversation-test", opportunityId: "opportunity-test", source: "WHATSAPP_AGENT" as const, normalizedInputHash: "email-fingerprint-1", emailType: "QUOTE" as const, recipient: "bianca@synthetic.invalid", subject: "Cotización TEST", textBody: "sandbox", htmlBody: "<p>sandbox</p>", templateVersion: "test-v1", relatedQuoteId: "quote-test" },
  reservation: { customerId: "customer-test", conversationId: "conversation-test", opportunityId: "opportunity-test", source: "WHATSAPP_AGENT" as const, customerEmail: "bianca@synthetic.invalid", eventDate: "2027-03-20", eventTime: "18:00", commune: "Santiago", venue: "Venue TEST", serviceCode: "CLASSIC", durationHours: 3 },
};

const quote = { quotationId: "quote-test", quotationNumber: "COT-TEST-001", operation: "CREATED" as const, total: 150000, currency: "CLP" as const, actorType: "SYSTEM_AGENT" as const, actorId: "BIANCA" as const, actionRunId: "run-quote-test", opportunityId: "opportunity-test", status: "SUCCESS" as const, createdAt: "2026-09-21T00:00:00.000Z" };
const email = { actionRunId: "run-email-test", conversationId: "conversation-test", opportunityId: "opportunity-test", emailType: "QUOTE" as const, recipient: "bianca@synthetic.invalid", relatedQuoteId: "quote-test", providerMessageId: "sandbox-gmail:email-test", status: "SENT" as const, sentAt: "2026-09-21T00:00:01.000Z", deliveryMode: "SANDBOX" as const };
const reservation = { actionRunId: "run-reservation-test", conversationId: "conversation-test", opportunityId: "opportunity-test", reservationId: "reservation-test", status: "STARTED" as const, startedAt: "2026-09-21T00:00:02.000Z", deliveryMode: "SANDBOX" as const, url: "https://test.invalid/booking" };

test("TEST funnel detects quote plus email request without asking for known data again", () => {
  const text = "cotízame 3 horas y mándamelo por correo";
  assert.deepEqual(detectBiancaIntents(text), ["ASK_PRICE", "REQUEST_EMAIL"]);
  const plan = planBiancaTurn({ text, known: { preferredName: "Cliente TEST", eventDate: "2027-03-20", commune: "Santiago", serviceCodes: ["CLASSIC"], durationHours: 3, priceResolved: true, availability: "AVAILABLE" } });
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.nextBestAction, "OFFER_RESERVATION");
});

test("full funnel persists evidence-backed state and does not duplicate provider side effects on retry", async () => {
  const calls = { quote: 0, email: 0, reservation: 0 };
  const once = new Set<string>();
  const dependencies = {
    createQuote: async () => { if (!once.has("quote")) { once.add("quote"); calls.quote += 1; } return quote; },
    sendEmail: async () => { if (!once.has("email")) { once.add("email"); calls.email += 1; } return email; },
    startReservation: async () => { if (!once.has("reservation")) { once.add("reservation"); calls.reservation += 1; } return reservation; },
  };
  const first = await executeBiancaFullFunnel(input, dependencies);
  const retry = await executeBiancaFullFunnel(input, dependencies);
  assert.deepEqual(calls, { quote: 1, email: 1, reservation: 1 });
  assert.equal(first.correlation.conversationId, "conversation-test");
  assert.equal(first.correlation.opportunityId, "opportunity-test");
  assert.equal(first.correlation.quoteId, "quote-test");
  assert.equal(first.correlation.emailRef, "sandbox-gmail:email-test");
  assert.equal(first.correlation.reservationId, "reservation-test");
  assert.equal(retry.stateTransitions.at(-1)?.to, "RESERVATION_STARTED");
});

test("intermediate failures never produce unsupported claims", async () => {
  const emailFailure = await executeBiancaFullFunnelSafely(input, {
    createQuote: async () => quote,
    sendEmail: async () => { throw new Error("SANDBOX_EMAIL_FAILED"); },
    startReservation: async () => reservation,
  });
  assert.equal("failedAt" in emailFailure, true);
  if (!("failedAt" in emailFailure)) throw new Error("expected email failure");
  assert.equal(emailFailure.failedAt, "SEND_EMAIL");
  assert.equal(emailFailure.partial.correlation.emailRef, null);
  assert.equal(emailFailure.partial.correlation.reservationId, null);
  assert.throws(() => assertBiancaClaims("Te envié la cotización por correo.", { quoteCreated: true }), /SEND_EMAIL_REQUIRED/);

  const reservationFailure = await executeBiancaFullFunnelSafely(input, {
    createQuote: async () => quote,
    sendEmail: async () => email,
    startReservation: async () => { throw new Error("TEST_RESERVATION_FAILED"); },
  });
  assert.equal("failedAt" in reservationFailure, true);
  if (!("failedAt" in reservationFailure)) throw new Error("expected reservation failure");
  assert.equal(reservationFailure.failedAt, "RESERVATION_START");
  assert.equal(reservationFailure.partial.correlation.emailRef, "sandbox-gmail:email-test");
  assert.equal(reservationFailure.partial.correlation.reservationId, null);
  assert.throws(() => assertBiancaClaims("Tu reserva está iniciada.", { emailSent: true }), /RESERVATION_START_REQUIRED/);
});

test("material quote changes create a new fingerprint and price exceptions hand off", () => {
  const base = { customerId: "customer-test", activeOpportunityId: "opportunity-test", serviceCodes: ["CLASSIC"], durationHours: 3, eventDate: "2027-03-20", eventTime: "18:00", location: "Venue TEST", commune: "Santiago" };
  assert.notEqual(biancaQuoteFingerprint(base), biancaQuoteFingerprint({ ...base, durationHours: 4 }));
  const plan = planBiancaTurn({ text: "¿me lo puedes dejar más barato?", known: { preferredName: "Cliente TEST", eventDate: base.eventDate, commune: base.commune, serviceCodes: base.serviceCodes, priceResolved: true } });
  assert.equal(plan.nextBestAction, "HANDOFF");
  assert.equal(plan.commercialStage, "HUMAN_REQUIRED");
});
