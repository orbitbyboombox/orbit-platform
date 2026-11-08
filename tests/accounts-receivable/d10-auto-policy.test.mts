import assert from "node:assert/strict";
import { test } from "node:test";
import { planD10AutoEmails } from "../../features/accounts-receivable/d10-auto-policy.ts";

const base = {
  projectId: "event-1", projectType: "WEDDING", eventDate: "2026-11-20",
  status: "PENDING", outstandingBalance: 100000, customerEmail: "cliente@example.com",
  confirmed: true, readyDetailsComplete: true,
};
test("confirmed wedding at D-10 qualifies for both messages", () => {
  assert.deepEqual(planD10AutoEmails(base, "2026-11-10", []), { eventReady: true, collection: true });
});
test("D-11 and D-9 never trigger automatic dispatch", () => {
  for (const day of ["2026-11-09", "2026-11-11"]) {
    assert.deepEqual(planD10AutoEmails(base, day, []), { eventReady: false, collection: false });
  }
});
test("settled wedding can receive ready message but never collection", () => {
  assert.deepEqual(planD10AutoEmails({...base, outstandingBalance: 0}, "2026-11-10", []), { eventReady: true, collection: false });
});
test("unconfirmed, cancelled, missing email or incomplete details block unsafe dispatch", () => {
  for (const changed of [{confirmed: false}, {status: "CANCELLED"}, {customerEmail: null}]) {
    assert.deepEqual(planD10AutoEmails({...base, ...changed}, "2026-11-10", []), { eventReady: false, collection: false });
  }
  assert.deepEqual(planD10AutoEmails({...base, readyDetailsComplete: false}, "2026-11-10", []), { eventReady: false, collection: true });
});
test("prior pending, sent or failed communication blocks automatic retries", () => {
  for (const status of ["QUEUED", "PENDING", "SENT", "FAILED"] as const) {
    const communications = [
      {projectId: "event-1", type: "EVENT_READY_D10" as const, status},
      {projectId: "event-1", type: "COLLECTION_D10" as const, status},
    ];
    assert.deepEqual(planD10AutoEmails(base, "2026-11-10", communications), { eventReady: false, collection: false });
  }
});
test("invalid calendar dates cannot trigger either message", () => {
  assert.deepEqual(planD10AutoEmails({...base, eventDate: "2026-02-30"}, "2026-02-20", []), { eventReady: false, collection: false });
});
