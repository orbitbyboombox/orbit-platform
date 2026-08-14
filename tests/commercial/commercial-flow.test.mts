import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommercialDocumentOwnership,
  calculateCommercialBalance,
  calculateCommercialDeposit,
  calculateCommercialTax,
  effectiveQuotationStatus,
  evaluateCommercialConfirmation,
} from "../../features/commercial-flow/commercial-policy.ts";
import { filterExtrasForEventType, includedExtrasForEventType } from "../../features/projects/reservation-business-rules.ts";

test("corporate quotation applies VAT once to the net value", () => {
  assert.deepEqual(calculateCommercialTax({ taxableAmount: 600_000, customerType: "COMPANY", vatPercentage: 19 }), { net: 600_000, vat: 114_000, total: 714_000 });
});

test("consumer quotation preserves the configured VAT-included catalog value", () => {
  assert.deepEqual(calculateCommercialTax({ taxableAmount: 600_000, customerType: "PRIVATE", vatPercentage: 19 }), { net: 600_000, vat: 0, total: 600_000 });
});

test("reservation deposit is exactly 50 percent of the frozen total", () => {
  assert.deepEqual(calculateCommercialDeposit({ amount: 600_000, currency: "CLP" }), { amount: 300_000, currency: "CLP" });
});

test("remaining balance derives from independent paid movements without becoming negative", () => {
  assert.equal(calculateCommercialBalance({ amount: 600_000, currency: "CLP" }, { amount: 300_000, currency: "CLP" }).amount, 300_000);
  assert.equal(calculateCommercialBalance({ amount: 600_000, currency: "CLP" }, { amount: 700_000, currency: "CLP" }).amount, 0);
});

test("a signed contract without the required deposit remains awaiting deposit", () => {
  assert.deepEqual(evaluateCommercialConfirmation({ agreementSigned: true, total: 600_000, paid: 299_999 }), { requiredDeposit: 300_000, depositSatisfied: false, agreementSigned: true, confirmed: false, state: "AWAITING_DEPOSIT" });
});

test("event confirmation requires both signature and required deposit", () => {
  assert.equal(evaluateCommercialConfirmation({ agreementSigned: false, total: 600_000, paid: 600_000 }).confirmed, false);
  assert.equal(evaluateCommercialConfirmation({ agreementSigned: true, total: 600_000, paid: 300_000 }).confirmed, true);
});

test("included wedding extras remain included and corporate extras exclude scrapbook", () => {
  assert.deepEqual(includedExtrasForEventType("Wedding"), ["QR", "Scrapbook"]);
  assert.deepEqual(filterExtrasForEventType("Corporate", ["Branding", "QR", "Scrapbook"]), ["Branding", "QR"]);
});

test("open quotations expire without mutating accepted or converted quotations", () => {
  assert.equal(effectiveQuotationStatus({ status: "SENT", expirationDate: "2026-08-01", today: "2026-08-14" }), "EXPIRED");
  assert.equal(effectiveQuotationStatus({ status: "CONVERTED", expirationDate: "2026-08-01", today: "2026-08-14" }), "CONVERTED");
});

test("a public signing token cannot be used for another agreement", () => {
  assert.equal(assertCommercialDocumentOwnership({ tokenAgreementId: "agreement-1", requestedAgreementId: "agreement-1" }), true);
  assert.throws(() => assertCommercialDocumentOwnership({ tokenAgreementId: "agreement-1", requestedAgreementId: "agreement-2" }), /no pertenece/);
});
