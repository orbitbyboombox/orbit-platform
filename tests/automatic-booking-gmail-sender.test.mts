import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GoogleGmailApiProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

const invitationService = readFileSync(
  new URL("../features/automatic-booking/automatic-booking.service.ts", import.meta.url),
  "utf8",
);

test("automatic booking invitation sends with the connected Workspace account", async () => {
  assert.match(invitationService, /workspace\\.workspaceAccount\\?\\.trim\\(\\)/);
  assert.match(invitationService, /from: senderEmail/);

  const requests: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ id: "qa-message", threadId: "qa-thread" }), { status: 200 });
  }) as typeof fetch;

  try {
    await new GoogleGmailApiProvider("qa-token").send({
      to: "customer@example.com",
      from: "booking@boom-box.cl",
      subject: "QA only",
      textBody: "QA only",
      htmlBody: "<p>QA only</p>",
      driveFileIds: [],
    });
    assert.deepEqual(requests, [
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
