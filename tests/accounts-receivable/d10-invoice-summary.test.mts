import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeD10Invoices } from "../../features/accounts-receivable/d10-invoice-summary.ts";

const a = { id: "a", status: "PARTIALLY_PAID", currency: "CLP", amount: 100000, paid_amount: 25000, outstanding_balance: 75000 };
const b = { id: "b", status: "PENDING", currency: "CLP", amount: 50000, paid_amount: 0, outstanding_balance: 50000 };

test("multiple invoices sum the true pending balance rather than the first", () => {
  const result = summarizeD10Invoices([a, b]);
  assert.equal(result.outstandingBalance, 125000);
  assert.equal(result.amount, 150000);
  assert.equal(result.paidAmount, 25000);
  assert.equal(result.invoices.length, 2);
  assert.equal(result.valid, true);
});
test("paid events suppress collection but remain eligible for separate ready notification", () => {
  const result = summarizeD10Invoices([{ ...a, status: "PAID", outstanding_balance: 0, paid_amount: 100000 }]);
  assert.equal(result.valid, true);
  assert.equal(result.outstandingBalance, 0);
});
test("missing invoices do not manufacture collection balance", () => {
  const result = summarizeD10Invoices([]);
  assert.equal(result.valid, true);
  assert.equal(result.outstandingBalance, 0);
  assert.equal(result.representative, null);
});
test("cancelled invoices are excluded while active invoices remain", () => {
  const result = summarizeD10Invoices([{ ...a, status: "CANCELLED" }, b]);
  assert.equal(result.outstandingBalance, 50000);
});
test("invalid balances or mixed currencies must block collection", () => {
  for (const invalid of [{ ...a, outstanding_balance: -1 }, { ...a, outstanding_balance: null }, { ...a, outstanding_balance: "NaN" }]) {
    assert.equal(summarizeD10Invoices([invalid, b]).valid, false);
    assert.equal(summarizeD10Invoices([invalid, b]).outstandingBalance, 0);
  }
  const mixed = summarizeD10Invoices([a, { ...b, currency: "USD" }]);
  assert.equal(mixed.valid, false);
  assert.equal(mixed.outstandingBalance, 0);
});
