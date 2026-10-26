import assert from "node:assert/strict";
import test from "node:test";
import { GoogleGmailApiProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

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
