import assert from "node:assert/strict";
import test from "node:test";
import { BiancaActionRunRepository } from "../features/connectors/whatsapp-cloud/bianca-action-runs.repository.ts";

function fakeClient(rows: Record<string, unknown>[]) {
  const updates: Record<string, unknown>[] = [];
  const builder = {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    upsert(payload: Record<string, unknown>) { updates.push(payload); return this; },
    single: async () => ({ data: { id: "run-1", status: "RUNNING" }, error: null }),
    update(payload: Record<string, unknown>) { updates.push(payload); return this; },
  };
  return { client: { from: () => builder } as never, updates };
}

test("action run repository returns existing success instead of replaying a side effect", async () => {
  const { client } = fakeClient([{ id: "run-1", status: "SUCCESS", result_summary: { quoteId: "q-1" }, external_ref: null, error_code: null }]);
  const result = await new BiancaActionRunRepository(client).claim({ customerId: "c", conversationId: "cv", opportunityId: "op", actionType: "QUOTE_CREATE", idempotencyKey: "key", inputSummary: {}, actorType: "SYSTEM_AGENT", actorId: "BIANCA", source: "WHATSAPP_AGENT" });
  assert.deepEqual(result, { status: "ALREADY_DONE", runId: "run-1" });
});

test("action run repository claims a new execution and records the running state", async () => {
  const { client, updates } = fakeClient([]);
  const result = await new BiancaActionRunRepository(client).claim({ customerId: "c", conversationId: "cv", opportunityId: "op", actionType: "QUOTE_CREATE", idempotencyKey: "key", inputSummary: { fingerprint: "abc" }, actorType: "SYSTEM_AGENT", actorId: "BIANCA", source: "WHATSAPP_AGENT" });
  assert.deepEqual(result, { status: "CLAIMED", runId: "run-1" });
  assert.equal(updates[0]?.status, "RUNNING");
});
