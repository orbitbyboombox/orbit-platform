import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyReceivableBucket,
  isReceivablePastDue,
  summarizeReceivableBuckets,
} from "../features/accounts-receivable/payment-term-classification.ts";

test("classifies receivables from official project type, never customer name", () => {
  assert.equal(classifyReceivableBucket("WEDDING"), "MARRIAGES");
  assert.equal(classifyReceivableBucket("Matrimonio"), "MARRIAGES");
  assert.equal(classifyReceivableBucket("COMPANY"), "BUSINESS_EVENTS");
  assert.equal(classifyReceivableBucket("Birthday"), "PARTICULAR_EVENTS");
  assert.equal(classifyReceivableBucket("Corporate"), "BUSINESS_EVENTS");
  assert.equal(classifyReceivableBucket("CORPORATE"), "BUSINESS_EVENTS");
  assert.equal(classifyReceivableBucket(""), "REVIEW");
  assert.equal(classifyReceivableBucket("EVENT"), "REVIEW");
});

test("uses canonical due-date status, not event date, for overdue classification", () => {
  assert.equal(isReceivablePastDue({ status: "PENDING", daysRemaining: 1 }), false);
  assert.equal(isReceivablePastDue({ status: "OVERDUE", daysRemaining: 1 }), true);
  assert.equal(isReceivablePastDue({ status: "PARTIALLY_PAID", daysRemaining: -1 }), true);
});

test("reconciles marriage, business/event, and review balances without duplicates", () => {
  const summaries = summarizeReceivableBuckets([
    { projectType: "WEDDING", outstandingBalance: 100_000, status: "PENDING", daysRemaining: 5 },
    { projectType: "COMPANY", outstandingBalance: 200_000, status: "OVERDUE", daysRemaining: -4 },
    { projectType: "BIRTHDAY", outstandingBalance: 50_000, status: "PENDING", daysRemaining: 10 },
    { projectType: "", outstandingBalance: 25_000, status: "PENDING", daysRemaining: null },
    { projectType: "COMPANY", outstandingBalance: 0, status: "PAID", daysRemaining: 0 },
  ]);
  assert.deepEqual(summaries.map((item) => item.pendingTotal), [100_000, 200_000, 50_000, 25_000]);
  assert.equal(summaries.reduce((sum, item) => sum + item.pendingTotal, 0), 375_000);
  assert.equal(summaries[1].overdueTotal, 200_000);
  assert.equal(summaries[1].currentTotal, 0);
  assert.equal(summaries[2].currentTotal, 50_000);
});

test("partial payments remain in the same bucket using outstanding balance only", () => {
  const [marriages] = summarizeReceivableBuckets([
    { projectType: "WEDDING", outstandingBalance: 75_000, status: "PARTIALLY_PAID", daysRemaining: 3 },
  ]);
  assert.equal(marriages.pendingTotal, 75_000);
  assert.equal(marriages.currentTotal, 75_000);
});

