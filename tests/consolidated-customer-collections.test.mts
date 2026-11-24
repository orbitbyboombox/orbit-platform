import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupReceivablesByCustomer, consolidatedCollectionFingerprint } from "../features/accounts-receivable/consolidated-collection.ts";
import type { ReceivableInvoice } from "../features/accounts-receivable/types.ts";

const invoice = (overrides: Partial<ReceivableInvoice> = {}): ReceivableInvoice => ({
  id: crypto.randomUUID(), invoiceNumber: "F-1", customerId: "customer-1", customerName: "Glow Pro", customerCompany: "Glow Pro Company", customerEmail: "qa@example.invalid", customerSecondaryEmail: null, customerRut: "76.123.456-7", projectId: crypto.randomUUID(), projectName: "Evento", projectType: "CORPORATE", orbitEventId: "ORB-TEST", customerType: "CORPORATE", status: "ISSUED", amount: 1_000_000, paidAmount: 0, outstandingBalance: 1_000_000, issueDate: "2026-10-01", dueDate: "2026-11-01", paymentTerm: "DAYS_30", customTermDays: null, paymentCategory: "STANDARD", paymentCategorySource: "INVOICE", canonicalPaymentTerm: "DAYS_30", canonicalPaymentTermDays: 30, purchaseOrder: null, daysRemaining: null, agingBucket: "CURRENT", version: 1, service: "Photobooth", eventDate: "2026-12-01", eventLocation: "Santiago", eventDuration: "4 horas", agreementId: null, contractAvailable: false, collectorId: null, collectorName: "", collectionActions: [], lastPayment: null, paymentHistory: [], ...overrides
} as ReceivableInvoice);

test("groups active balances by customer and separates overdue/upcoming amounts", () => {
  const first = invoice({ id: "a", projectId: "p-a", projectName: "Matrimonio A", outstandingBalance: 1_500_000, dueDate: "2026-11-01" });
  const second = invoice({ id: "b", projectId: "p-b", projectName: "Evento B", outstandingBalance: 1_118_000, dueDate: "2026-12-01" });
  const paid = invoice({ id: "c", status: "PAID", outstandingBalance: 0 });
  const other = invoice({ id: "d", customerId: "customer-2", customerName: "Otra empresa", outstandingBalance: 9_000 });
  const group = groupReceivablesByCustomer([first, second, paid, other], "2026-11-23").find((item) => item.customerId === "customer-1");
  assert.ok(group);
  assert.equal(group.customerId, "customer-1");
  assert.equal(group.lines.length, 2);
  assert.equal(group.overdueTotal, 1_500_000);
  assert.equal(group.upcomingTotal, 1_118_000);
  assert.equal(group.totalOutstanding, 2_618_000);
  assert.equal(group.oldestOverdueDays, 22);
  assert.equal(group.oldestTermDays, 30);
});

test("fingerprint changes when a selected effective balance changes", () => {
  const a = invoice({ id: "a", projectId: "p-a", outstandingBalance: 100 });
  const b = invoice({ id: "b", projectId: "p-b", outstandingBalance: 200 });
  const [group] = groupReceivablesByCustomer([a, b], "2026-11-23");
  const original = consolidatedCollectionFingerprint(group, ["a", "b"]);
  const changed = { ...group, lines: group.lines.map((line) => line.invoice.id === "b" ? { ...line, invoice: { ...line.invoice, outstandingBalance: 201 } } : line) };
  assert.notEqual(original, consolidatedCollectionFingerprint(changed, ["a", "b"]));
});

test("premium template shows canonical bank details and dynamic contractual overdue label", () => {
  const template = readFileSync("features/accounts-receivable/consolidated-collection.template.ts", "utf8");
  assert.match(template, /DÍAS VENCIDOS DEL ACUERDO A/);
  assert.match(template, /oldestTermDays/);
  assert.match(template, /BOOMBOX/);
  assert.match(template, /bankDetails\.companyLabel/);
});

test("migration is idempotent, admin-only and scoped to consolidated communications", () => {
  const sql = readFileSync("supabase/migrations/20261124120000_consolidated_customer_collections.sql", "utf8");
  assert.match(sql, /create unique index if not exists/);
  assert.match(sql, /COLLECTION_EMAIL_CONSOLIDATED/);
  assert.match(sql, /public\.can_administer\(\)/);
  assert.match(sql, /revoke all on function/);
  assert.doesNotMatch(sql, /delete from public\.(invoice_payments|payments|accounts_receivable_projection)/i);
});

test("manual consolidated action does not become an automatic cron sender", () => {
  const action = readFileSync("features/accounts-receivable/consolidated-collection.actions.ts", "utf8");
  assert.match(action, /sendConsolidatedCollectionAction/);
  assert.match(action, /prepare_consolidated_collection/);
  assert.doesNotMatch(action, /cron|schedule|setInterval/i);
});
