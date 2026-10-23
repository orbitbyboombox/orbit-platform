import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GoogleGmailApiProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";
import { buildGmailAcceptancePatch, isCommercialSendAccepted } from "../features/commercial-hub/commercial-delivery-ledger.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("commercial Gmail payload uses explicit sender and multipart alternative", async () => {
  const calls: RequestInit[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ id: "gmail-accepted", threadId: "thread-1" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new GoogleGmailApiProvider("test-token").send({
      to: "client@example.com",
      from: "matias@boom-box.cl",
      replyTo: "ventas@boom-box.cl",
      subject: "Cotización",
      textBody: "Versión de texto",
      htmlBody: "<p>Versión HTML</p>",
      idempotencyKey: "request-123",
      driveFileIds: [],
    });
    assert.deepEqual(result, { messageId: "gmail-accepted", threadId: "thread-1" });
    const payload = JSON.parse(String(calls[0]?.body)) as { raw: string };
    const raw = Buffer.from(payload.raw, "base64url").toString("utf8");
    assert.match(raw, /From: matias@boom-box\.cl/);
    assert.match(raw, /Reply-To: ventas@boom-box\.cl/);
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /Versión de texto/);
    assert.match(raw, /<p>Versión HTML<\/p>/);
    assert.match(raw, /X-ORBIT-Idempotency-Key: request-123/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Gmail provider retries transient failures and does not retry permanent failures", async () => {
  let attempts = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    attempts += 1;
    return attempts === 1
      ? new Response("temporary", { status: 503 })
      : new Response(JSON.stringify({ id: "accepted-after-retry", threadId: "thread-2" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await new GoogleGmailApiProvider("test-token").send({ to: "client@example.com", subject: "Test", textBody: "text", htmlBody: "<p>html</p>", driveFileIds: [], maxSendAttempts: 2 });
    assert.equal(result.messageId, "accepted-after-retry");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }

  attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    return new Response("forbidden", { status: 403 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => new GoogleGmailApiProvider("test-token").send({ to: "client@example.com", subject: "Test", textBody: "text", htmlBody: "<p>html</p>", driveFileIds: [], maxSendAttempts: 3 }), /Gmail request failed \(403\)/);
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("commercial actions distinguish Gmail acceptance and preserve retry safety", () => {
  const actions = source("features/commercial-hub/actions.ts");
  const migration = source("supabase/migrations/20261023140000_commercial_delivery_stage1.sql");
  assert.match(actions, /status: "GMAIL_ACCEPTED"/);
  assert.match(actions, /provider_response: \{ accepted: true/);
  assert.match(actions, /provider_accepted_at/);
  assert.match(actions, /idempotencyKey: input\.requestId/);
  assert.match(actions, /from: senderEmail/);
  assert.match(actions, /isCommercialSendAccepted\(existingSend\?\.status\)/);
  assert.match(migration, /GMAIL_ACCEPTED/);
  assert.match(migration, /DELIVERED/);
  assert.match(migration, /BOUNCED/);
  assert.match(migration, /add column if not exists provider_response jsonb/);
  assert.match(migration, /add column if not exists attempt_count integer/);
});

test("post-send persistence errors reconcile as accepted without authorizing a resend", () => {
  const patch = buildGmailAcceptancePatch({ messageId: "accepted-1", threadId: "thread-1" }, "matias@boom-box.cl", "2026-10-23T13:00:00.000Z", true);
  assert.equal(patch.status, "GMAIL_ACCEPTED");
  assert.equal(patch.provider_response.reconciliationRequired, true);
  assert.equal(isCommercialSendAccepted("GMAIL_ACCEPTED"), true);
  assert.equal(isCommercialSendAccepted("SENT"), true);
  assert.equal(isCommercialSendAccepted("PREPARING"), false);
});
