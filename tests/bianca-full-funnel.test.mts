import assert from "node:assert/strict";
import test from "node:test";
import { executeBiancaFullFunnel, reservationEvidenceForClaim } from "../features/connectors/whatsapp-cloud/bianca-full-funnel.ts";

const quote = { quotationId: "quote-1", quotationNumber: "COT-1", operation: "CREATED" as const, total: 119000, currency: "CLP" as const, actorType: "SYSTEM_AGENT" as const, actorId: "BIANCA" as const, actionRunId: "run-quote", opportunityId: "op-1", status: "SUCCESS" as const, createdAt: new Date().toISOString() };
const email = { actionRunId: "run-email", conversationId: "conversation-1", opportunityId: "op-1", emailType: "QUOTE" as const, recipient: "bianca.qa.invalid@example.invalid", relatedQuoteId: "quote-1", providerMessageId: "mock-email", status: "SENT" as const, sentAt: new Date().toISOString(), deliveryMode: "MOCK" as const };
const reservation = { actionRunId: "run-reservation", conversationId: "conversation-1", opportunityId: "op-1", reservationId: "reservation-1", status: "STARTED" as const, startedAt: new Date().toISOString(), deliveryMode: "MOCK" as const, url: null };

test("full funnel composes quote, email and reservation in order", async () => {
  const order: string[] = [];
  const result = await executeBiancaFullFunnel({ quote: {} as never, email: {} as never, reservation: {} as never }, {
    createQuote: async () => { order.push("quote"); return quote; },
    sendEmail: async () => { order.push("email"); return email; },
    startReservation: async () => { order.push("reservation"); return reservation; },
  });
  assert.deepEqual(order, ["quote", "email", "reservation"]);
  assert.equal(result.quote.quotationId, "quote-1");
  assert.equal(reservationEvidenceForClaim(result.reservation!), reservation);
});

test("full funnel does not start reservation when email fails", async () => {
  let reservationCalled = false;
  await assert.rejects(() => executeBiancaFullFunnel({ quote: {} as never, email: {} as never, reservation: {} as never }, {
    createQuote: async () => quote,
    sendEmail: async () => { throw new Error("EMAIL_FAILED"); },
    startReservation: async () => { reservationCalled = true; return reservation; },
  }), /EMAIL_FAILED/);
  assert.equal(reservationCalled, false);
});
