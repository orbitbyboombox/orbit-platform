import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleGmailApiProvider } from "../../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

const message = {
  to: "d10-qa@example.com", idempotencyKey: "d10:synthetic-project:COLLECTION_D10:2026-11-20",
  subject: "QA only", textBody: "Synthetic D-10 delivery", htmlBody: "<p>QA only</p>", driveFileIds: [],
};

test("D-10 Gmail provider sends one synthetic request with its stable idempotency key", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let requestBody = "";
  globalThis.fetch = (async (input, init) => {
    calls++;
    if (String(input).includes("openidconnect.googleapis.com")) return new Response(JSON.stringify({ email: "qa-sender@example.com" }), { status: 200 });
    assert.match(String(input), /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send$/);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "synthetic-message", threadId: "synthetic-thread" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new GoogleGmailApiProvider("synthetic-token").send({ ...message, maxSendAttempts: 1 });
    const raw = JSON.parse(requestBody).raw as string;
    const mime = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));
    assert.equal(calls, 2);
    assert.deepEqual(result, { messageId: "synthetic-message", threadId: "synthetic-thread" });
    assert.match(mime, /Message-ID: <d10-synthetic-project-COLLECTION_D10-2026-11-20@orbit\.boom-box\.cl>/);
    assert.match(mime, /X-ORBIT-Idempotency-Key: d10-synthetic-project-COLLECTION_D10-2026-11-20/);
    assert.match(mime, /To: d10-qa@example\.com/);
  } finally { globalThis.fetch = originalFetch; }
});

test("an uncertain Gmail response is not retried by the D-10 single-attempt method", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input) => { if (String(input).includes("openidconnect.googleapis.com")) return new Response(JSON.stringify({ email: "qa-sender@example.com" }), { status: 200 }); calls++; return new Response("temporary provider error", { status: 503 }); }) as typeof fetch;
  try {
    await assert.rejects(() => new GoogleGmailApiProvider("synthetic-token").send({ ...message, maxSendAttempts: 1 }), /503/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
