import assert from "node:assert/strict";
import test from "node:test";
import { resolveCollectionEmailStatus } from "../../features/accounts-receivable/collection-email-status.ts";

const sent = (overrides: Record<string, unknown> = {}) => ({
  id: "sent-1",
  status: "SENT",
  occurredAt: "2026-11-10T15:00:00.000Z",
  sentAt: "2026-11-10T15:00:00.000Z",
  externalMessageId: "gmail-message-1",
  toRecipient: "cliente@example.com",
  createdBy: "Founder",
  ...overrides,
});

test("D-10 cobranza without a successful delivery is visibly pending", () => {
  const result = resolveCollectionEmailStatus([]);
  assert.equal(result.state, "PENDING");
  assert.equal(result.label, "CORREO DE COBRO PENDIENTE");
});

test("successful manual delivery exposes time, recipient and actor", () => {
  const result = resolveCollectionEmailStatus([sent()]);
  assert.equal(result.state, "SENT");
  assert.equal(result.sentAt, "2026-11-10T15:00:00.000Z");
  assert.equal(result.recipient, "cliente@example.com");
  assert.equal(result.actorId, "Founder");
});

test("a newer failed attempt is not presented as sent", () => {
  const result = resolveCollectionEmailStatus([
    sent(),
    sent({ id: "failed-1", status: "FAILED", occurredAt: "2026-11-11T15:00:00.000Z", sentAt: null, failureReason: "Gmail no disponible" }),
  ]);
  assert.equal(result.state, "FAILED");
  assert.equal(result.label, "ERROR DE ENVÍO");
  assert.equal(result.failureReason, "Gmail no disponible");
  assert.equal(result.sentAt, null);
});

test("a later retry changes the visible state while retaining the old failure in history", () => {
  const result = resolveCollectionEmailStatus([
    { id: "failed-1", status: "FAILED", occurredAt: "2026-11-10T15:00:00.000Z", failureReason: "Timeout" },
    sent({ id: "sent-2", occurredAt: "2026-11-11T15:00:00.000Z", sentAt: "2026-11-11T15:00:00.000Z" }),
  ]);
  assert.equal(result.state, "SENT");
  assert.equal(result.sentAt, "2026-11-11T15:00:00.000Z");
});

test("queued or pending records remain visibly pending", () => {
  const result = resolveCollectionEmailStatus([{ id: "pending", status: "PENDING", occurredAt: "2026-11-10T15:00:00.000Z" }]);
  assert.equal(result.state, "PENDING");
  assert.equal(result.label, "CORREO DE COBRO PENDIENTE");
});

test("SENT without a Gmail receipt remains visibly pending", () => {
  const result = resolveCollectionEmailStatus([sent({ externalMessageId: null })]);
  assert.equal(result.state, "PENDING");
  assert.equal(result.sentAt, null);
});
