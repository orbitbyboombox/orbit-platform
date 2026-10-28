import assert from "node:assert/strict";
import test from "node:test";
import {
  GoogleGmailApiProvider,
  GoogleGmailDeliveryOutcomeUnknownError,
  GoogleGmailRequestTimeoutError,
} from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

test("sender resolution uses the granted OpenID email scope before sending", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  let rawMessage = "";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer qa-token");
      return new Response(JSON.stringify({ email: "matias@boom-box.cl" }), { status: 200 });
    }
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    rawMessage = String(JSON.parse(String(init?.body)).raw);
    return new Response(JSON.stringify({ id: "qa-message", threadId: "qa-thread" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await new GoogleGmailApiProvider("qa-token").send({
      to: "matias.maira.larrain@gmail.com",
      subject: "QA only",
      textBody: "QA only",
      htmlBody: "<p>QA only</p>",
      driveFileIds: [],
    });
    assert.deepEqual(result, { messageId: "qa-message", threadId: "qa-thread" });
    assert.deepEqual(requests, [
      "https://openidconnect.googleapis.com/v1/userinfo",
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    ]);
    const mime = Buffer.from(rawMessage, "base64url").toString("utf8");
    assert.match(mime, /From: =\?UTF-8\?B\?.*\?= <matias@boom-box\.cl>/);
    assert.doesNotMatch(requests.join("\n"), /users\/me\/profile/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Gmail delivery timeout is classified as unknown and is never retried", async () => {
  const previousFetch = globalThis.fetch;
  let sendAttempts = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input) === "https://openidconnect.googleapis.com/v1/userinfo") {
      return new Response(JSON.stringify({ email: "matias@boom-box.cl" }), { status: 200 });
    }
    sendAttempts += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => new GoogleGmailApiProvider("qa-token", "me", 1_000).send({
        to: "client@example.com",
        subject: "QA only",
        textBody: "QA only",
        htmlBody: "<p>QA only</p>",
        driveFileIds: [],
      }),
      (error: unknown) => error instanceof GoogleGmailDeliveryOutcomeUnknownError,
    );
    assert.equal(sendAttempts, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("OAuth timeout happens before Gmail POST and is a known failure", async () => {
  const previousFetch = globalThis.fetch;
  let gmailPostAttempts = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes("openidconnect.googleapis.com")) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    }
    gmailPostAttempts += 1;
    return new Response(JSON.stringify({ id: "unexpected", threadId: "unexpected" }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => new GoogleGmailApiProvider("qa-token", "me", 1_000).send({
        to: "client@example.com",
        subject: "QA only",
        textBody: "QA only",
        htmlBody: "<p>QA only</p>",
        driveFileIds: [],
      }),
      (error: unknown) => error instanceof GoogleGmailRequestTimeoutError,
    );
    assert.equal(gmailPostAttempts, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
