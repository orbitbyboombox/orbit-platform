import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalFinanceLedger, canonicalLedgerSummary } from "../features/finance/canonical-ledger-core.ts";

const invoice = (overrides: Record<string, unknown> = {}) => ({ id: "inv-1", invoiceNumber: "F-1", projectId: "p-1", orbitEventId: "ORB-1", projectName: "Evento", customerName: "Cliente", amount: 100_000, recordedPaidAmount: 0, status: "ISSUED", dueDate: "2026-11-10", ...overrides });
const payment = (overrides: Record<string, unknown> = {}) => ({ id: "pay-1", invoiceId: "inv-1", amount: 25_000, paidAt: "2026-11-01T12:00:00Z", method: "TRANSFER", ...overrides });

test("payment partial keeps sold, collected and receivable separate", () => {
  const [row] = buildCanonicalFinanceLedger([invoice()], [payment()]);
  assert.deepEqual({ sold: row.sold, collected: row.collected, receivable: row.receivable, state: row.state }, { sold: 100_000, collected: 25_000, receivable: 75_000, state: "RECEIVABLE" });
});

test("full payment is collected and never exceeds sold", () => {
  const [row] = buildCanonicalFinanceLedger([invoice({ recordedPaidAmount: 100_000 })], [payment({ amount: 100_000 })]);
  assert.equal(row.state, "COLLECTED");
  assert.equal(row.receivable, 0);
});

test("exact duplicate payment is review required without changing the recorded amount", () => {
  const [row] = buildCanonicalFinanceLedger([invoice()], [payment(), payment({ id: "pay-2" })]);
  assert.equal(row.collected, 50_000);
  assert.equal(row.integrity, "REVIEW_REQUIRED");
  assert.deepEqual(row.duplicatePaymentIds, ["pay-1", "pay-2"]);
});

test("two equal legitimate installments on different dates remain separate and are not flagged", () => {
  const [row] = buildCanonicalFinanceLedger([invoice()], [payment(), payment({ id: "pay-2", paidAt: "2026-11-02T12:00:00Z" })]);
  assert.equal(row.collected, 50_000);
  assert.equal(row.integrity, "OK");
  assert.equal(row.cashMovements.length, 2);
  assert.deepEqual(row.cashMovements.map((movement) => movement.date), ["2026-11-01T12:00:00Z", "2026-11-02T12:00:00Z"]);
});

test("reversal is excluded from collected cash and cancellation remains visible", () => {
  const rows = buildCanonicalFinanceLedger([invoice({ id: "inv-1", recordedPaidAmount: 25_000 }), invoice({ id: "inv-2", status: "CANCELLED", effectiveStatus: "CANCELLED" })], [payment({ cashImpact: 25_000 }), payment({ id: "rev-1", amount: 25_000, paidAt: "2026-11-02T12:00:00Z", cashImpact: -25_000, movementType: "REVERSAL" })]);
  assert.equal(rows[0].collected, 0);
  assert.deepEqual(rows[0].cashMovements.map((movement) => movement.kind), ["INCOMING", "OUTGOING"]);
  assert.equal(rows[1].state, "CANCELLED");
});

test("summary separates cash from receivables", () => {
  const summary = canonicalLedgerSummary(buildCanonicalFinanceLedger([invoice(), invoice({ id: "inv-2", amount: 50_000, recordedPaidAmount: 50_000 })], [payment()]));
  assert.deepEqual(summary, { sold: 150_000, collected: 75_000, receivable: 75_000, cancelled: 0, reviewRequired: 0 });
});

test("cancelled sale with a prior payment is excluded from active totals", () => {
  const rows = buildCanonicalFinanceLedger([invoice({ amount: 100_000, effectiveStatus: "CANCELLED" }), invoice({ id: "inv-2", amount: 50_000 })], [payment({ cashImpact: 25_000 })]);
  assert.deepEqual(canonicalLedgerSummary(rows), { sold: 50_000, collected: 0, receivable: 50_000, cancelled: 1, reviewRequired: 0 });
});

test("inconsistent recorded balance is capped without creating negative receivables", () => {
  const [row] = buildCanonicalFinanceLedger([invoice({ recordedPaidAmount: 150_000 })], []);
  assert.equal(row.collected, 100_000);
  assert.equal(row.receivable, 0);
});
