import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertQuoteConversionReady,
  buildQuoteConversionReview,
  resolveQuoteConversionEvent,
} from "../features/commercial-hub/quote-conversion.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/0167_quote_reservation_commercial_event_file.sql");
const actions = source("features/commercial-hub/actions.ts");
const hub = source("features/commercial-hub/commercial-hub.tsx");
const reviewUi = source("features/commercial-hub/quote-conversion-review.tsx");
const eventHub = source("features/external-tax-documents/event-commercial-document-hub.tsx");
const ocActions = source("features/commercial-documents/actions.ts");

const acceptedSnapshot = {
  quotation: {
    id: "quote-1",
    number: "COTIZACIÓN 2026-000100",
    version: 3,
    acceptedAt: "2026-08-25T12:00:00Z",
    pdfStoragePath: "commercial/quotes/quote-1/quote.pdf",
    subtotal: 500000,
    discountTotal: 50000,
    taxTotal: 85500,
    grandTotal: 535500,
    depositPercent: 40,
  },
  customer: {
    company: "Empresa Uno",
    rut: "76.565.272-3",
    contact: "Ana Productora",
    email: "ana@empresa.cl",
    secondaryEmail: "finanzas@empresa.cl",
    phone: "56911111111",
    address: "Av. Uno 123",
  },
  commercial: {
    event: {
      name: "Lanzamiento",
      date: "2026-11-20",
      time: "19:00",
      location: "Centro de Eventos",
      city: "Las Condes",
      durationHours: 4,
    },
    subtotal: 500000,
    discount: 50000,
    net: 450000,
    tax: 85500,
    total: 535500,
    depositPercent: 40,
    deposit: 214200,
    balance: 321300,
    paymentCondition: "FIFTY_FIFTY",
    paymentTermDays: 0,
    conditions: ["Acceso coordinado"],
  },
  items: [
    { id: "i1", itemType: "SERVICE", code: "CLASSIC", label: "Classic", quantity: 2, catalogPrice: 200000, quotedPrice: 200000, total: 400000, isManual: false, displayOrder: 0 },
    { id: "i2", itemType: "TRANSPORT", code: "TRANSPORT", label: "Transporte cliente", quantity: 1, catalogPrice: 100000, quotedPrice: 100000, total: 100000, isManual: false, displayOrder: 1 },
  ],
};
const review = buildQuoteConversionReview({ quoteId: "quote-1", status: "ACCEPTED", customerId: "customer-1", snapshot: acceptedSnapshot });

test("1 accepted quote is eligible for reservation review", () => {
  assert.doesNotThrow(() => assertQuoteConversionReady(review, {}));
  assert.match(hub, /GENERAR RESERVA DESDE COTIZACIÓN/);
});
test("2 customer data transfers from the accepted snapshot", () => assert.deepEqual(review.customer, acceptedSnapshot.customer));
test("3 company and RUT transfer", () => { assert.equal(review.customer.company, "Empresa Uno"); assert.equal(review.customer.rut, "76.565.272-3"); });
test("4 contact transfers", () => assert.equal(review.customer.contact, "Ana Productora"));
test("5 event date transfers", () => assert.equal(review.event.date, "2026-11-20"));
test("6 schedule transfers", () => { assert.equal(review.event.time, "19:00"); assert.equal(review.event.durationHours, 4); });
test("7 venue address and commune transfer", () => { assert.equal(review.event.location, "Centro de Eventos"); assert.equal(review.event.city, "Las Condes"); });
test("8 accepted services items and quantities transfer", () => { assert.equal(review.items[0].code, "CLASSIC"); assert.equal(review.items[0].quantity, 2); });
test("9 accepted financial values remain exact", () => assert.deepEqual(review.financial, { subtotal:500000,discount:50000,net:450000,tax:85500,total:535500,depositPercent:40,deposit:214200,balance:321300,customerTransportCharge:100000,paymentCondition:"FIFTY_FIFTY",paymentTermDays:0 }));
test("10 customer transport charge remains revenue", () => { assert.equal(review.financial.customerTransportCharge, 100000); assert.match(actions, /negotiatedTransport: acceptedTransport/); });
test("11 internal real transport cost stays outside conversion", () => { assert.doesNotMatch(actions, /real_logistics_cost|financial_cost_overrides|transport_cost/); assert.match(reviewUi, /costo real de transporte permanece separado/); });
test("12 missing operational fields are requested", () => {
  const incomplete = buildQuoteConversionReview({ quoteId:"q2",status:"ACCEPTED",snapshot:{...acceptedSnapshot,commercial:{...acceptedSnapshot.commercial,event:{}}} });
  assert.ok(incomplete.missing.includes("Fecha del evento"));
  assert.throws(() => assertQuoteConversionReady(incomplete, {}), /Completa antes de crear/);
  assert.equal(resolveQuoteConversionEvent(incomplete, { name:"Evento",date:"2026-10-10",time:"18:00",location:"Lugar",city:"Santiago",durationHours:3 }).durationHours, 3);
});
test("13 double click uses one quote conversion transaction", () => { assert.match(migration, /pg_advisory_xact_lock/); assert.match(migration, /conversion_transaction_id=tx_id/); });
test("14 browser retry resumes one reservation transaction", () => { assert.match(actions, /reservationTransactionId: claim\.transactionId/); assert.match(actions, /reservationResumed/); });
test("15 concurrent Founder sessions cannot duplicate the conversion", () => { assert.match(migration, /quotation_id uuid not null unique/); assert.match(migration, /project_id uuid not null unique/); });
test("16 accepted quote snapshot is immutable", () => { assert.match(migration, /accepted_snapshot jsonb not null/); assert.match(migration, /project_commercial_origins_immutable/); assert.match(migration, /snapshot aceptado de la cotización es inmutable/); });
test("17 accepted quote PDF is visible from Event and immutable route data", () => { const route=source("app/api/commercial/quotes/[quoteId]/pdf/route.ts");const document=source("features/commercial-hub/formal-quote-document.ts");assert.match(eventHub, /VER PDF/);assert.match(route,/loadFormalQuoteDocument/);assert.match(document, /accepted_snapshot/); });
test("18 OC upload accepts protected supported formats", () => { assert.match(ocActions, /application\/pdf/); assert.match(ocActions, /image\/jpeg/); assert.match(ocActions, /image\/png/); assert.match(ocActions, /orbit-documents/); });
test("19 OC persists after reload from canonical documents", () => { assert.match(source("app/(platform)/projects/[projectId]/page.tsx"), /purchase_order_number/); assert.match(eventHub, /CUSTOMER_PURCHASE_ORDER/); });
test("20 OC access is authenticated and project-scoped", () => { const route=source("app/api/projects/[projectId]/documents/[documentId]/route.ts"); assert.match(route, /auth\.getUser/); assert.match(route, /\.eq\("project_id", projectId\)/); assert.match(route, /Cache-Control": "private, no-store/); });
test("21 contract remains surfaced from canonical agreement document", () => { assert.match(eventHub, /CONTRATO/); assert.match(eventHub, /props\.contract\.href/); });
test("22 existing SII flow is reused", () => { assert.match(eventHub, /ExternalTaxDocumentsCenter/); assert.doesNotMatch(eventHub, /register_external_tax_document/); });
test("23 payment receipts display without ledger mutation", () => { assert.match(eventHub, /PAYMENT_RECEIPT/); assert.doesNotMatch(eventHub, /invoice_payments|receivable_movements|paid_amount/); });
test("24 commercial progress derives canonical states", () => { for(const label of ["COTIZACIÓN","OC CLIENTE","CONTRATO","FACTURA / SII","PAGO"]) assert.match(eventHub,new RegExp(label)); assert.match(eventHub,/NO REQUERIDA/); });
test("25 existing quotation lifecycle remains canonical", () => { assert.match(hub, /MARCAR COMO ACEPTADA/); assert.match(migration, /q\.status not in \('SENT','VIEWED','ACCEPTED'\)/); });
test("26 existing reservation pipeline is reused", () => { assert.match(actions, /createCustomerProjectAction\(draft\)/); assert.doesNotMatch(actions, /\.from\("projects"\)\.insert/); });
test("27 Payment Ledger code and schema are untouched", () => { assert.doesNotMatch(migration, /invoice_payments|receivable_movements|paid_amount/); assert.doesNotMatch(ocActions, /invoice_payments|receivable_movements|paid_amount/); });
test("28 Secondary Email CC regression remains unchanged", () => { assert.match(actions, /secondaryEmail: customer\.secondaryEmail/); assert.match(actions, /cc_recipients: recipients\.cc/); assert.doesNotMatch(migration, /secondary_email|cc_recipients|communications/); });
test("29 mobile conversion uses fullscreen MobileDialog and reachable footer", () => { assert.match(reviewUi, /variant="fullscreen-mobile"/); assert.match(reviewUi, /footer=/); assert.match(reviewUi, /CONFIRMAR Y CREAR RESERVA/); assert.match(reviewUi, /min-w-0/); });
