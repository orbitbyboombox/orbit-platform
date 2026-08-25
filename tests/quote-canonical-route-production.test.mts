import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCommercialQuoteDetail,
  commercialQuoteHref,
  quoteDetailActions,
} from "../features/commercial-hub/quote-detail.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const customerProfile = source("features/crm/customer-profile.tsx");
const crmRepository = source("features/crm/repository.ts");
const detailUi = source(
  "features/commercial-hub/quote-detail-experience.tsx",
);
const detailRepository = source("features/commercial-hub/repository.ts");
const actions = source("features/commercial-hub/actions.ts");
const hub = source("features/commercial-hub/commercial-hub.tsx");
const reviewUi = source("features/commercial-hub/quote-conversion-review.tsx");
const migration = source(
  "supabase/migrations/0167_quote_reservation_commercial_event_file.sql",
);
const eventHub = source(
  "features/external-tax-documents/event-commercial-document-hub.tsx",
);

const sentRow = {
  id: "11111111-1111-4111-8111-111111111111",
  quotation_number: "2026-826",
  version: 2,
  status: "SENT",
  customer_id: "customer-ccu",
  project_id: null,
  issue_date: "2026-08-25",
  expiration_date: "2026-09-04",
  created_at: "2026-08-25T13:46:25Z",
  approved_at: null,
  approved_by: null,
  converted_at: null,
  customer_snapshot: {
    company: "Compañia Cervecerias Unidas S.a",
    rut: "90.413.000-1",
    contact: "Jenniffer Chavez",
    email: "jfchave@ccu.cl",
    secondaryEmail: "",
    phone: "56993194600",
    address: "Avenida Vitacura 2670",
  },
  commercial_snapshot: {
    event: {
      name: "Activación CCU",
      date: "2026-10-10",
      time: "18:30",
      location: "Centro de Eventos",
      city: "Las Condes",
    },
    subtotal: 290000,
    discount: 0,
    net: 290000,
    tax: 55100,
    total: 345100,
    depositPercent: 50,
    deposit: 172550,
    balance: 172550,
  },
  validity_days: 10,
  deposit_percent: 50,
  global_discount_type: null,
  global_discount_value: 0,
  subtotal: 290000,
  discount_total: 0,
  tax_total: 55100,
  grand_total: 345100,
  final_customer_price: 345100,
  quotation_items: [
    {
      id: "item-1",
      item_type: "SERVICE",
      code: "CLASSIC",
      description: "Classic",
      quantity: 1,
      catalog_price: 290000,
      quoted_price: 290000,
      total: 290000,
      discount_type: null,
      discount_value: 0,
      is_manual: false,
      display_order: 0,
    },
  ],
};

const draftRow = {
  ...sentRow,
  id: "22222222-2222-4222-8222-222222222222",
  quotation_number: "2026-820",
  status: "DRAFT",
  grand_total: 11120550,
  final_customer_price: 11120550,
  commercial_snapshot: {
    ...sentRow.commercial_snapshot,
    total: 11120550,
    deposit: 5560275,
    balance: 5560275,
  },
};

test("1 commercial-history quotation links to the canonical quote route", () => {
  assert.equal(
    commercialQuoteHref(sentRow.id),
    `/quotes/${sentRow.id}`,
  );
  assert.match(crmRepository, /href: commercialQuoteHref\(item\.id\)/);
  assert.doesNotMatch(customerProfile, /projects\/\$\{item\.projectId\}/);
});

test("2 the canonical App Router quote page exists", () => {
  assert.equal(
    existsSync(
      new URL(
        "../app/(platform)/quotes/[quoteId]/page.tsx",
        import.meta.url,
      ),
    ),
    true,
  );
  assert.match(detailRepository, /\.eq\("id", normalized\)/);
  assert.match(detailRepository, /\.order\("sent_at"/);
  assert.doesNotMatch(detailRepository, /sent_at,created_at/);
});

test("3 real SENT quote shape opens without requiring a project", () => {
  const detail = buildCommercialQuoteDetail(sentRow);
  assert.equal(detail.number, "2026-826");
  assert.equal(detail.projectId, null);
  assert.equal(detail.status, "SENT");
  assert.equal(detail.financial.total, 345100);
});

test("4 real DRAFT quote shape opens and remains editable", () => {
  const detail = buildCommercialQuoteDetail(draftRow);
  assert.equal(detail.number, "2026-820");
  assert.equal(detail.status, "DRAFT");
  assert.ok(detail.draft);
  assert.equal(detail.draft?.quoteId, draftRow.id);
  assert.match(detailUi, /CONTINUAR EDITANDO/);
});

test("5 SENT exposes explicit acceptance and DRAFT does not", () => {
  assert.equal(quoteDetailActions("SENT", null).canAccept, true);
  assert.equal(quoteDetailActions("DRAFT", null).canAccept, false);
  assert.match(detailUi, /MARCAR COMO ACEPTADA/);
  assert.match(detailUi, /window\.confirm/);
});

test("6 SENT acceptance persists the canonical acceptance timestamp", () => {
  assert.match(migration, /approved_at=now\(\)/);
  assert.match(detailRepository, /approved_at/);
  assert.match(detailUi, /quote\.acceptedAt/);
});

test("7 SENT acceptance persists the canonical accepting Founder", () => {
  assert.match(migration, /approved_by=actor/);
  assert.match(detailRepository, /approved_by/);
  assert.match(detailUi, /acceptedByFounder/);
});

test("8 ACCEPTED exposes Generate Reservation prominently", () => {
  assert.equal(quoteDetailActions("ACCEPTED", null).canConvert, true);
  assert.match(detailUi, /GENERAR RESERVA DESDE COTIZACIÓN/);
});

test("9 DRAFT cannot silently convert", () => {
  assert.equal(quoteDetailActions("DRAFT", null).canConvert, false);
  assert.match(migration, /q\.status<>\'ACCEPTED\'/);
  assert.match(actions, /La cotización debe estar ACEPTADA/);
});

test("10 conversion review reuses the existing accepted-quote dialog", () => {
  assert.match(detailUi, /loadCommercialQuoteConversionReviewAction/);
  assert.match(detailUi, /QuoteConversionReviewDialog/);
  assert.match(reviewUi, /title="GENERAR RESERVA"/);
});

test("11 customer data is prepopulated from the canonical quote", () => {
  const detail = buildCommercialQuoteDetail(sentRow);
  assert.equal(detail.customer.company, sentRow.customer_snapshot.company);
  assert.equal(detail.customer.rut, sentRow.customer_snapshot.rut);
  assert.equal(detail.customer.contact, sentRow.customer_snapshot.contact);
});

test("12 event data is prepopulated from the canonical quote", () => {
  const detail = buildCommercialQuoteDetail(sentRow);
  assert.deepEqual(detail.event, sentRow.commercial_snapshot.event);
});

test("13 financial values remain exact", () => {
  const detail = buildCommercialQuoteDetail(sentRow);
  assert.deepEqual(detail.financial, {
    subtotal: 290000,
    discount: 0,
    net: 290000,
    tax: 55100,
    total: 345100,
    depositPercent: 50,
    deposit: 172550,
    balance: 172550,
  });
});

test("14 one quote maps to one immutable Event origin", () => {
  assert.match(migration, /quotation_id uuid not null unique/);
  assert.match(migration, /project_id uuid not null unique/);
  assert.match(actions, /createCustomerProjectAction\(draft\)/);
});

test("15 double click and browser retry resume one transaction", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /conversion_transaction_id=tx_id/);
  assert.match(actions, /reservationTransactionId: claim\.transactionId/);
});

test("16 concurrent conversion is protected", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /on conflict\(quotation_id\) do nothing/);
  assert.match(actions, /duplicate: Boolean\(result\.project\.reservationResumed\)/);
});

test("17 converted quote exposes View Event instead of conversion", () => {
  assert.equal(quoteDetailActions("CONVERTED", "project-1").isConverted, true);
  assert.match(detailUi, /RESERVA YA GENERADA/);
  assert.match(detailUi, /VER EVENTO/);
});

test("18 accepted quote PDF remains protected and accessible", () => {
  assert.match(detailUi, /api\/commercial\/quotes\/\$\{quote\.id\}\/pdf/);
  const pdfRoute = source("app/api/commercial/quotes/[quoteId]/pdf/route.ts");
  assert.match(pdfRoute, /auth\.getUser/);
  assert.match(pdfRoute, /accepted_snapshot/);
});

test("19 every Founder quote entry point resolves to canonical detail", () => {
  assert.match(customerProfile, /href=\{item\.href\}/);
  assert.match(hub, /href=\{`\/quotes\/\$\{q\.id\}`\}/);
  assert.match(eventHub, /ABRIR COTIZACIÓN/);
  assert.match(eventHub, /props\.quotation\.detailHref/);
});

test("20 Commercial Documents and OC remain available after conversion", () => {
  assert.match(eventHub, /DOCUMENTOS COMERCIALES/);
  assert.match(eventHub, /CustomerPurchaseOrderCenter/);
  assert.match(eventHub, /OC CLIENTE/);
});

test("21 Payment Ledger and Email CC behavior remain untouched", () => {
  assert.doesNotMatch(detailUi, /invoice_payments|receivable_movements|paid_amount/);
  assert.doesNotMatch(detailUi, /cc_recipients|secondary_email|GoogleGmailApiProvider/);
  assert.match(actions, /secondaryEmail: customer\.secondaryEmail/);
  assert.match(actions, /cc_recipients: recipients\.cc/);
});

test("22 mobile routing and conversion controls remain reachable", () => {
  assert.match(detailUi, /flex flex-col gap-2 sm:flex-row/);
  assert.match(detailUi, /min-h-11/);
  assert.match(reviewUi, /variant="fullscreen-mobile"/);
  assert.match(reviewUi, /footer=/);
});
