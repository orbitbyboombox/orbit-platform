import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminD10TestMessage, D10_ADMIN_TEST_LOG_TYPE, D10_ADMIN_TEST_RECIPIENT, D10_ADMIN_TEST_SUBJECT, sendAdminD10TestMessage } from "../../features/connectors/google-gmail/application/d10-admin-test-email.ts";
import { daysUntilPreEvent } from "../../features/connectors/google-gmail/application/pre-event-reminder.template.ts";

const now = new Date("2026-11-10T16:00:00.000Z");
const key = "pre-event-admin-test:synthetic-founder:2026-11-10";

test("administrative D-10 test is fixed to the owner and stored separately from operational mail", () => {
  const message = buildAdminD10TestMessage(key, now);
  assert.equal(D10_ADMIN_TEST_RECIPIENT, "matias.maira.larrain@gmail.com");
  assert.equal(message.to, D10_ADMIN_TEST_RECIPIENT);
  assert.equal(message.subject, "PRUEBA D-10 · BOOMBOX");
  assert.equal(D10_ADMIN_TEST_LOG_TYPE, "PRE_EVENT_REMINDER_ADMIN_TEST");
  assert.equal(daysUntilPreEvent(message.eventDate, now), 10);
  assert.match(message.textBody, /PRUEBA D-10/);
  assert.match(message.htmlBody, /PRUEBA D-10/);
  assert.deepEqual(message.driveFileIds, []);
  assert.equal("cc" in message, false);
  assert.equal("bcc" in message, false);
});

test("Gmail mock confirms only the synthetic admin message", async () => {
  const sent: unknown[] = [];
  const result = await sendAdminD10TestMessage({
    async send(message) {
      sent.push(message);
      return { messageId: "gmail-mock-message-1", threadId: "gmail-mock-thread-1" };
    },
    async createDraft() {
      throw new Error("draft not used");
    },
  }, key, now);
  assert.equal(sent.length, 1);
  assert.equal(result.providerMessageId, "gmail-mock-message-1");
  assert.equal(result.to, "matias.maira.larrain@gmail.com");
  assert.equal(result.subject, "PRUEBA D-10 · BOOMBOX");
});

test("an unconfirmed Gmail result never returns a sent receipt", async () => {
  await assert.rejects(
    () => sendAdminD10TestMessage({
      async send() { return { messageId: "", threadId: "gmail-mock-thread-2" }; },
      async createDraft() { throw new Error("draft not used"); },
    }, key, now),
    /GMAIL_CONFIRMATION_MISSING/,
  );
});
