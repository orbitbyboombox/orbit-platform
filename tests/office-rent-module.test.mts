import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildOfficeLeaseMetrics, formatClp, formatOfficeDate, monthLabel, receiptLabel, type OfficeLeaseMonth, type OfficeLeaseSettings } from "../features/office-rent/model.ts";
import { createOfficeLeaseReceiptPdf } from "../features/office-rent/receipt-pdf.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260916095845_office_lease_module.sql");
const navigationMigration = source("supabase/migrations/20260916101314_activate_office_rent_navigation.sql");
const actions = source("features/office-rent/actions.ts");
const ui = source("features/office-rent/office-rent-center.tsx");
const navigation = source("components/layout/navigation.ts");
const workspace = source("features/founder-workspace/catalog.ts");
const cashFlow = source("app/(platform)/finance/cash-flow/page.tsx");
const middleware = source("middleware.ts");

const settings: OfficeLeaseSettings = {
  id: "lease",
  tenantLegalName: "IMPORTADORA Y COMERCIALIZADORA ESTALLIDO SpA",
  tenantRut: "77.413.411-5",
  tenantAddress: "Guillermo Mann 1305, Ñuñoa",
  tenantEmail: "heber@emimax.cl",
  tenantPhone: "",
  tenantRepresentative: "Heber Eliecer Gatica Gatica",
  contractStartDate: "2026-09-01",
  contractEndDate: "",
  observations: "",
  unitName: "Oficina 310",
  propertyAddress: "Puerta Oriente 361, Colina",
  concept: "Arriendo Oficina 310",
  monthlyAmount: 450_000,
  commonExpensesIncluded: true,
  dueDay: 5,
  mortgageCost: 505_000,
  commonExpensesCost: 110_000,
  version: 1,
};

const months: OfficeLeaseMonth[] = [
  { id: "sep", period: "2026-09-01", dueDate: "2026-09-05", amountDue: 450_000, receivedAmount: 450_000, outstandingAmount: 0, status: "PAID", payments: [] },
  { id: "oct", period: "2026-10-01", dueDate: "2026-10-05", amountDue: 450_000, receivedAmount: 0, outstandingAmount: 450_000, status: "PENDING", payments: [] },
];

test("office cost projection preserves gross expenses and applies rent separately", () => {
  const metrics = buildOfficeLeaseMetrics(settings, months, "2026-09-16");
  assert.equal(metrics.grossOfficeCost, 615_000);
  assert.equal(metrics.contractedRent, 450_000);
  assert.equal(metrics.netContractCost, 165_000);
  assert.equal(metrics.yearReceived, 450_000);
});

test("receipt labels satisfy the initial and following correlation format", () => {
  assert.equal(receiptLabel(1), "N°001");
  assert.equal(receiptLabel(2), "N°002");
  assert.equal(receiptLabel(12), "N°012");
});

test("office rent SSR text is deterministic across server and browser runtimes", () => {
  assert.equal(formatClp(615_000), "$615.000");
  assert.equal(formatOfficeDate("2026-09-05"), "05 sept 2026");
  assert.equal(monthLabel("2026-10-01"), "Octubre de 2026");
  assert.doesNotMatch(ui, /new Date\(|toLocaleDateString|toLocaleString/);
  assert.match(ui, /defaultValue=\{data\.today\}/);
});

test("September receipt renders as a professional one-page PDF", async () => {
  const bytes = await createOfficeLeaseReceiptPdf({
    settings,
    company: { brandName: "BOOMBOX", legalName: "BOOMBOX SpA", taxId: "76.000.000-0", address: "Colina", city: "Santiago" },
    payment: { receiptNumber: 1, paidOn: "2026-09-16", amount: 450_000, paymentMethod: "TRANSFERENCIA", observation: "" },
    period: "2026-09-01",
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(bytes.byteLength > 1_500);
});

test("October payment receives the next unique receipt without reusing September", () => {
  assert.match(migration, /office_lease_receipt_counter/);
  assert.match(migration, /select next_number into next_receipt[\s\S]*for update/);
  assert.match(migration, /receipt_number integer not null unique/);
  assert.match(migration, /select \* into existing from public\.office_lease_payments where idempotency_key/);
  assert.ok(migration.indexOf("select * into existing") < migration.indexOf("select next_number into next_receipt"));
});

test("monthly obligations are idempotent and keep historical amounts", () => {
  assert.match(migration, /unique \(settings_id, period\)/);
  assert.match(migration, /on conflict\(settings_id,period\) do nothing/);
  assert.match(migration, /configuration\.monthly_amount/);
  assert.doesNotMatch(migration, /update public\.office_lease_obligations\s+set\s+amount_due/);
  assert.match(middleware, /request\.nextUrl\.pathname === "\/api\/cron\/office-lease-monthly"/);
});

test("payment registration prevents overpayment and keeps proof plus generated receipt", () => {
  assert.match(migration, /if p_amount > remaining then/);
  assert.match(migration, /document_type='PAYMENT_PROOF'/);
  assert.match(migration, /document_type='INCOME_RECEIPT'/);
  assert.match(actions, /register_office_lease_payment/);
  assert.match(actions, /attach_office_lease_income_receipt/);
  assert.match(actions, /receiptPending/);
});

test("Founder UX provides responsive controls, busy states and safe document types", () => {
  assert.match(ui, /REGISTRAR PAGO/);
  assert.match(ui, /loading=\{paymentPending\}/);
  assert.match(ui, /application\/pdf,image\/jpeg,image\/png/);
  assert.match(ui, /md:hidden/);
  assert.match(ui, /hidden overflow-x-auto md:block/);
  assert.match(actions, /15 \* 1024 \* 1024/);
});

test("the module is registered without resetting Founder workspace visibility", () => {
  assert.match(navigation, /key: "OFFICE_RENT"/);
  assert.match(navigation, /label: "Arriendo Oficina"/);
  assert.match(workspace, /hiddenNavigation: \["OFFICE_RENT"\]/);
  assert.match(navigationMigration, /array_append\(workspace\.navigation_order,'OFFICE_RENT'\)/);
  assert.match(navigationMigration, /array_remove\(workspace\.hidden_navigation,'OFFICE_RENT'\)/);
  assert.doesNotMatch(navigationMigration, /navigation_order\s*=\s*array\['HOME'/);
  assert.match(cashFlow, /office_lease_payments/);
  assert.match(cashFlow, /kind:"INCOMING"/);
});

test("RLS and grants restrict the lease owner to Founder and Admin", () => {
  assert.match(migration, /alter table public\.office_lease_payments enable row level security/);
  assert.match(migration, /revoke all on table public\.office_lease_payments from anon,authenticated/);
  assert.match(migration, /office_lease_payments_admin_select/);
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /with \(security_invoker=true\)/);
});
