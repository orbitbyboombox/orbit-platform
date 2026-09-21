import assert from "node:assert/strict";
import test from "node:test";
import { executeCanonicalQuoteDraft } from "../features/commercial-hub/canonical-quote.service.ts";
import { biancaSystemActor } from "../features/connectors/whatsapp-cloud/bianca-actor-context.ts";

const draft = {
  requestId: "quote-1", existingCustomerId: "customer-1", saveTemporaryCustomer: false,
  company: "", rut: "", contact: "Andrés", email: "andres@example.com", secondaryEmail: "",
  phone: "+56912345678", address: "", eventName: "Matrimonio", eventDate: "2026-11-21",
  eventTime: "20:00", eventLocation: "Piedra Roja", eventCity: "Colina", validityDays: 10,
  depositPercent: 50, paymentCondition: "FIFTY_FIFTY" as const, paymentTermDays: 0,
  globalDiscountType: null, globalDiscountValue: 0, attachCatalog: false,
  lines: [{ id: "1", code: "CLASSIC", description: "Classic", quantity: 1, catalogPrice: 500000, quotedPrice: 500000, discountType: null, discountValue: 0, manual: false }],
};

function fakeClient() {
  const calls: string[] = [];
  return { calls, client: { rpc: async (name: string) => { calls.push(name); return { data: { quotationId: "q-1", quotationNumber: "COTIZACIÓN 2026-000001", operation: "CREATED" }, error: null }; } } as never };
}

test("BIANCA quote execution uses the dedicated authorized bridge", async () => {
  const { client, calls } = fakeClient();
  const result = await executeCanonicalQuoteDraft({ client, draft, customerId: "customer-1", actor: biancaSystemActor() });
  assert.deepEqual(calls, ["save_bianca_commercial_quote_draft"]);
  assert.equal(result.quotationId, "q-1");
  assert.equal(result.actorId, "BIANCA");
});

test("HUMAN quote execution uses the same canonical service with the human RPC wrapper", async () => {
  const { client, calls } = fakeClient();
  const result = await executeCanonicalQuoteDraft({ client, draft, customerId: "customer-1", actor: { actorType: "HUMAN", actorId: "HUMAN_USER", source: "FOUNDER_UI" } });
  assert.deepEqual(calls, ["save_commercial_quote_draft"]);
  assert.equal(result.actorType, "HUMAN");
});

test("quote evidence cannot be created from an unverifiable RPC result", async () => {
  const client = { rpc: async () => ({ data: { operation: "CREATED" }, error: null }) } as never;
  await assert.rejects(() => executeCanonicalQuoteDraft({ client, draft, customerId: "customer-1", actor: biancaSystemActor() }), /QUOTE_RESULT_NOT_VERIFIABLE/);
});
