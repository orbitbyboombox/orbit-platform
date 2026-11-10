import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverClaimedD10 } from "../../features/accounts-receivable/d10-delivery.ts";

test("concurrent isolated cron claims send once and persist the winning message id", async () => {
  let claimed = false;
  let sends = 0;
  const history: string[] = [];
  const run = () => deliverClaimedD10({
    claim: async () => { if (claimed) return false; claimed = true; history.push("QUEUED"); return true; },
    sendOnce: async () => { sends++; return { messageId: "fake-message-1", threadId: "fake-thread-1" }; },
    markSent: async (result) => { history.push(`SENT:${result.messageId}`); },
    markFailed: async () => { history.push("FAILED"); },
  });
  const results = await Promise.all([run(), run(), run()]);
  assert.deepEqual(results.sort(), ["SENT", "SKIPPED", "SKIPPED"]);
  assert.equal(sends, 1);
  assert.deepEqual(history, ["QUEUED", "SENT:fake-message-1"]);
});

test("a failed or ambiguous Gmail attempt stays claimed and is never resent automatically", async () => {
  let claimed = false;
  let sends = 0;
  let failures = 0;
  const run = () => deliverClaimedD10({
    claim: async () => { if (claimed) return false; claimed = true; return true; },
    sendOnce: async () => { sends++; throw new Error("network response uncertain"); },
    markSent: async () => assert.fail("unexpected success"),
    markFailed: async () => { failures++; },
  });
  assert.equal(await run(), "FAILED");
  assert.equal(await run(), "SKIPPED");
  assert.equal(sends, 1);
  assert.equal(failures, 1);
});

test("Gmail acceptance followed by history-write failure does not retry the email", async () => {
  let claimed = false;
  let sends = 0;
  const run = () => deliverClaimedD10({
    claim: async () => { if (claimed) return false; claimed = true; return true; },
    sendOnce: async () => { sends++; return { messageId: "accepted", threadId: "thread" }; },
    markSent: async () => { throw new Error("database unavailable after acceptance"); },
    markFailed: async () => assert.fail("accepted message must not become retryable"),
  });
  assert.equal(await run(), "SENT");
  assert.equal(await run(), "SKIPPED");
  assert.equal(sends, 1);
});
