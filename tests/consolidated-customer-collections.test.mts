import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupReceivablesByCustomer, consolidatedCollectionFingerprint } from "../features/accounts-receivable/consolidated-collection.ts";
import { buildConsolidatedCollectionHtml, buildConsolidatedCollectionText } from "../features/accounts-receivable/consolidated-collection.template.ts";
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

test("uses overdue as the primary amount while retaining future debt", () => {
  const overdue = invoice({ id: "overdue", dueDate: "2026-11-01", outstandingBalance: 2_618_000 });
  const future = invoice({ id: "future", dueDate: "2099-01-01", outstandingBalance: 833_000 });
  const [group] = groupReceivablesByCustomer([overdue, future], "2026-11-24");
  assert.equal(group.overdueTotal, 2_618_000);
  assert.equal(group.upcomingTotal, 833_000);
  assert.equal(group.totalOutstanding, 3_451_000);
  assert.equal(group.oldestOverdueDays, 23);
});

test("fingerprint changes when a selected effective balance changes", () => {
  const a = invoice({ id: "a", projectId: "p-a", outstandingBalance: 100 });
  const b = invoice({ id: "b", projectId: "p-b", outstandingBalance: 200 });
  const [group] = groupReceivablesByCustomer([a, b], "2026-11-23");
  const original = consolidatedCollectionFingerprint(group, ["a", "b"]);
  const changed = { ...group, lines: group.lines.map((line) => line.invoice.id === "b" ? { ...line, invoice: { ...line.invoice, outstandingBalance: 201 } } : line) };
  assert.notEqual(original, consolidatedCollectionFingerprint(changed, ["a", "b"]));
});

test("groups same customer without RUT when a verified recipient exists", () => {
  const first = invoice({ id: "no-rut-a", customerCompany: "GLOW PRO COMPANY", customerRut: null, dueDate: "2026-11-01", customerEmail: "qa@example.invalid" });
  const second = invoice({ id: "no-rut-b", customerCompany: "GLOW PRO COMPANY", customerRut: null, dueDate: "2026-12-01", customerEmail: "qa@example.invalid" });
  const [group] = groupReceivablesByCustomer([first, second], "2026-11-23");
  assert.equal(group.reviewRequired, false);
  assert.equal(group.lines.length, 2);
});

const bankDetails = {
  companyLabel: "PRODUCCIONES BOOMBOX COMPANY SPA",
  bankName: "Banco de Prueba",
  accountType: "Cuenta Corriente",
  accountNumber: "123456789",
  rut: "76.123.456-7",
  email: "pagos@boom-box.cl",
};

test("premium collection mail uses the company greeting and a compact, separated balance summary", () => {
  const renaissance = invoice({ id: "renaissance", projectName: "Activación Hotel Renaissance", dueDate: "2026-11-02", amount: 714_000, outstandingBalance: 714_000, paymentTerm: "CASH", canonicalPaymentTerm: "CASH", canonicalPaymentTermDays: 0, service: "Black Studio", invoiceNumber: "ORBIT-INTERNAL-1" });
  const essential = invoice({ id: "essential", projectName: "Evento Esencial", dueDate: "2026-11-05", amount: 1_904_000, outstandingBalance: 1_904_000, paymentTerm: "DAYS_30", canonicalPaymentTerm: "DAYS_30", canonicalPaymentTermDays: 30, service: "BBOX360 con traslado", invoiceNumber: "ORBIT-INTERNAL-2" });
  const restaurant = invoice({ id: "restaurant", projectName: "Evento Restaurant KO", dueDate: "2026-12-09", amount: 833_000, outstandingBalance: 833_000, service: "Cabina con impresión", invoiceNumber: "ORBIT-INTERNAL-3" });
  const [group] = groupReceivablesByCustomer([renaissance, essential, restaurant], "2026-11-24");
  const selected = { ...group, oldestTermDays: 0, bankDetails };
  const text = buildConsolidatedCollectionText(selected);
  const html = buildConsolidatedCollectionHtml(selected, "Cobranza consolidada");

  assert.match(text, /^ESTIMADOS GLOW PRO COMPANY:/);
  assert.equal((text.match(/ESTIMADOS GLOW PRO COMPANY:/g) ?? []).length, 1);
  assert.match(text, /22 DÍAS VENCIDOS/);
  assert.doesNotMatch(text, /ACUERDO A 0 DÍAS|ORBIT-INTERNAL|BBOX360|traslado/);
  assert.match(text, /TOTAL VENCIDO A PAGAR/);
  assert.match(text, /TOTAL POR VENCER/);
  assert.match(text, /2\.618\.000/);
  assert.match(text, /833\.000/);
  assert.match(text, /3\.451\.000/);
  assert.match(text, /Banco de Prueba/);
  assert.equal((html.match(/Activación Hotel Renaissance/g) ?? []).length, 1);
  assert.equal((html.match(/Evento Esencial/g) ?? []).length, 1);
  assert.equal((html.match(/Evento Restaurant KO/g) ?? []).length, 1);
  assert.match(html, /https:\/\/app\.bbox\.cl\/branding\/boombox-logo-official-white-email\.png/);
  assert.match(html, /DEPARTAMENTO DE FINANZAS/);
  assert.match(html, /22 DÍAS VENCIDOS/);
  assert.doesNotMatch(html, /ACUERDO A 0 DÍAS|ORBIT-INTERNAL|BBOX360|traslado/);
  assert.match(html, /Eventos vencidos/);
  assert.match(html, /Eventos por vencer/);
});

test("shows a positive term only when the oldest selected overdue obligation has a signed document", () => {
  const essential = invoice({ id: "essential", projectName: "Evento Esencial", dueDate: "2026-11-05", canonicalPaymentTermDays: 30, paymentCategorySource: "PROJECT_FINANCE", contractAvailable: true });
  const [group] = groupReceivablesByCustomer([essential], "2026-11-24");
  const body = buildConsolidatedCollectionText({ ...group, bankDetails });
  assert.match(body, /19 DÍAS VENCIDOS DEL ACUERDO A 30 DÍAS/);

  const unsigned = { ...group, oldestTermDays: 30, lines: group.lines.map((line) => ({ ...line, invoice: { ...line.invoice, contractAvailable: false } })) };
  assert.match(buildConsolidatedCollectionText({ ...unsigned, bankDetails }), /19 DÍAS VENCIDOS\n/);
  assert.doesNotMatch(buildConsolidatedCollectionText({ ...unsigned, bankDetails }), /ACUERDO A 0 DÍAS|ACUERDO A 30 DÍAS/);
});

test("shows partial payments only when they are positive and formats due dates as Chilean dates", () => {
  const partial = invoice({ id: "partial", projectName: "Evento Parcial", dueDate: "2026-11-02", paidAmount: 100_000, amount: 714_000, outstandingBalance: 614_000 });
  const [group] = groupReceivablesByCustomer([partial], "2026-11-24");
  const text = buildConsolidatedCollectionText({ ...group, bankDetails });
  assert.match(text, /Vencimiento: 02\/11\/2026/);
  assert.match(text, /Abonos registrados/);
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

test("previous individual and D-10 communications do not permanently block a new consolidated attempt", () => {
  const action = readFileSync("features/accounts-receivable/consolidated-collection.actions.ts", "utf8");
  assert.doesNotMatch(action, /ya tiene una cobranza individual, D-10 o automática/);
  assert.match(action, /COLLECTION_EMAIL_CONSOLIDATED/);
  assert.match(action, /status\", \"PENDING/);
});

test("concurrent consolidated attempts are serialized per customer", () => {
  const migration = readFileSync("supabase/migrations/20261124150000_consolidated_collection_retry_guard.sql", "utf8");
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status = 'PENDING'/);
  assert.match(migration, /revoke all on function/);
});
