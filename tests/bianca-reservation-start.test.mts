import assert from "node:assert/strict";
import test from "node:test";
import { BiancaReservationStartAdapter } from "../features/connectors/whatsapp-cloud/bianca-reservation-start.adapter.ts";

function fakeClient() {
  const rows: Record<string, unknown>[] = [];
  const client = { from() {
    const filter: Record<string, unknown> = {};
    let mode = "select";
    let payload: Record<string, unknown> = {};
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filter[key] = value; return builder; },
      maybeSingle: async () => ({ data: rows.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) ?? null, error: null }),
      upsert(value: Record<string, unknown>) { mode = "upsert"; payload = value; return builder; },
      update(value: Record<string, unknown>) { mode = "update"; payload = value; return builder; },
      single: async () => { if (mode === "upsert") { rows.push({ id: "run-reservation-1", ...payload }); return { data: { id: "run-reservation-1", status: "RUNNING" }, error: null }; } return { data: null, error: null }; },
      then(resolve: (value: { error: null }) => unknown) { if (mode === "update") Object.assign(rows[0] ?? {}, payload); return Promise.resolve(resolve({ error: null })); },
    };
    return builder;
  } } as never;
  return client;
}

const complete = { customerId: "customer-test", conversationId: "conversation-test", opportunityId: "opportunity-test", source: "WEB_AGENT" as const, customerEmail: "bianca.qa.invalid@example.invalid", eventDate: "2026-12-12", eventTime: "18:00", commune: "Ñuñoa", venue: "TEST Venue", serviceCode: "CLASSIC", durationHours: 2 };

test("reservation start returns NEEDS_INFORMATION without mutating", async () => {
  let called = false;
  const adapter = new BiancaReservationStartAdapter(fakeClient(), async () => { called = true; return { reservationId: "r", url: null }; }, "MOCK");
  const result = await adapter.start({ ...complete, eventDate: undefined });
  assert.deepEqual(result, { status: "NEEDS_INFORMATION", missingFields: ["eventDate"] });
  assert.equal(called, false);
});

test("reservation start uses one canonical starter and is idempotent", async () => {
  let calls = 0;
  const adapter = new BiancaReservationStartAdapter(fakeClient(), async () => { calls += 1; return { reservationId: "reservation-test", url: null }; }, "MOCK");
  const first = await adapter.start(complete);
  const second = await adapter.start(complete);
  assert.equal(first.status, "STARTED");
  assert.equal(second.status, "ALREADY_DONE");
  assert.equal(calls, 1);
});
