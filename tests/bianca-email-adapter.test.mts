import assert from "node:assert/strict";
import test from "node:test";
import { BiancaEmailAdapter } from "../features/connectors/google-gmail/application/bianca-email.adapter.ts";
import { InMemoryGoogleGmailLiveProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

function fakeClient() {
  const tables: Record<string, Record<string, unknown>[]> = { bianca_action_runs: [], commercial_sends: [] };
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let operation: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Record<string, unknown> | null = null;
      const builder = {
        select() { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        maybeSingle: async () => {
          const row = tables[table].find((item) => Object.entries(filters).every(([key, value]) => item[key] === value)) ?? null;
          return { data: row, error: null };
        },
        upsert(value: Record<string, unknown>) { operation = "upsert"; payload = value; return builder; },
        insert(value: Record<string, unknown>) { operation = "insert"; payload = value; return builder; },
        update(value: Record<string, unknown>) { operation = "update"; payload = value; return builder; },
        single: async () => {
          if (operation === "upsert") {
            const existing = tables[table].find((item) => item.idempotency_key === payload?.idempotency_key);
            if (existing) Object.assign(existing, payload);
            else tables[table].push({ id: "run-1", ...(payload as Record<string, unknown>) });
            return { data: { id: "run-1", status: "RUNNING" }, error: null };
          }
          if (operation === "insert") {
            const row = { id: `send-${tables[table].length + 1}`, ...(payload as Record<string, unknown>) };
            tables[table].push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: { error: null }) => unknown) {
          if (operation === "update") {
            for (const row of tables[table]) {
              if (Object.entries(filters).every(([key, value]) => row[key] === value)) Object.assign(row, payload);
            }
          }
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return builder;
    },
  } as never;
  return { client, tables };
}

const input = {
  customerId: "customer-test",
  conversationId: "conversation-test",
  opportunityId: "opportunity-test",
  source: "WEB_AGENT" as const,
  normalizedInputHash: "quote-fingerprint",
  emailType: "QUOTE" as const,
  recipient: "bianca.qa.invalid@example.invalid",
  subject: "Cotización TEST",
  textBody: "Mensaje TEST",
  htmlBody: "<p>Mensaje TEST</p>",
  templateVersion: "v1",
  relatedQuoteId: "quote-test",
};

test("BIANCA email adapter uses mock delivery and returns typed evidence", async () => {
  const { client, tables } = fakeClient();
  const adapter = new BiancaEmailAdapter(client, new InMemoryGoogleGmailLiveProvider(), "MOCK");
  const evidence = await adapter.send(input);
  assert.equal(evidence.deliveryMode, "MOCK");
  assert.equal(evidence.status, "SENT");
  assert.equal(evidence.emailType, "QUOTE");
  assert.equal(tables.commercial_sends.length, 1);
  assert.equal(tables.bianca_action_runs.length, 1);
});

test("same email fingerprint reconciles without a second provider call", async () => {
  const { client, tables } = fakeClient();
  let providerCalls = 0;
  const provider = { send: async () => { providerCalls += 1; return { messageId: "mock-message-1", threadId: "mock-thread-1" }; }, createDraft: async () => ({ messageId: "draft-message", threadId: "draft-thread", draftId: "draft-1" }) };
  const adapter = new BiancaEmailAdapter(client, provider, "MOCK");
  const first = await adapter.send(input);
  const second = await adapter.send(input);
  assert.equal(providerCalls, 1);
  assert.equal(first.providerMessageId, second.providerMessageId);
  assert.equal(second.status, "ALREADY_DONE");
  assert.equal(tables.commercial_sends.length, 1);
});
