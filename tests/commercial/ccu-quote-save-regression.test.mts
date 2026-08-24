import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { calculateFormalQuote } from "../../features/commercial-hub/quote-calculation.ts";
import { prepareFormalQuotePersistence } from "../../features/commercial-hub/quote-persistence.ts";
import { createFormalQuotePdf } from "../../features/commercial-hub/formal-quote-pdf.ts";
import type { FormalQuoteDraft } from "../../features/commercial-hub/types.ts";

const ccuDraft = (): FormalQuoteDraft => ({
  quoteId: "90562e4b-0ee8-42b7-9d8b-db502c168343",
  requestId: "90562e4b-0ee8-42b7-9d8b-db502c168343",
  existingCustomerId: "fff0bc58-cac6-4b28-b292-85fcfced156c",
  saveTemporaryCustomer: false,
  company: "Compañia Cervecerias Unidas S.a",
  rut: "904130001",
  contact: "CCU",
  email: "",
  phone: "",
  address: "",
  eventName: "Evento corporativo",
  eventDate: "",
  eventTime: "",
  eventLocation: "",
  eventCity: "",
  validityDays: 10,
  depositPercent: 58,
  globalDiscountType: null,
  globalDiscountValue: 0,
  attachCatalog: false,
  lines: [
    {
      id: "ccu-service",
      code: "BLACK_STUDIO",
      description: "Black Studio",
      quantity: 7,
      catalogPrice: 1_120_000,
      quotedPrice: 1_335_000,
      discountType: null,
      discountValue: 0,
      manual: false,
    },
    {
      id: "ccu-branding",
      code: "BRANDING",
      description: "Branding",
      quantity: 14,
      catalogPrice: 0,
      quotedPrice: 0,
      discountType: null,
      discountValue: 0,
      manual: false,
    },
  ],
});

async function pdfText(pdf: Uint8Array) {
  const document = await getDocument({ data: Uint8Array.from(pdf) }).promise;
  const output: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    output.push(content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
  }
  await document.destroy();
  return output.join(" ");
}

test("CCU quote preserves exact net, VAT, total, 58% deposit and balance", () => {
  const prepared = prepareFormalQuotePersistence(ccuDraft());
  assert.equal(prepared.calculation.net, 9_345_000);
  assert.equal(prepared.calculation.vat, 1_775_550);
  assert.equal(prepared.calculation.total, 11_120_550);
  assert.equal(prepared.calculation.deposit, 6_449_919);
  assert.equal(prepared.calculation.balance, 4_670_631);
  assert.equal(prepared.commercialSnapshot.validityDays, 10);
  assert.equal(prepared.commercialSnapshot.discount, 0);
});

test("CCU persistence payload retains every quote item without duplicates", () => {
  const prepared = prepareFormalQuotePersistence(ccuDraft());
  assert.equal(prepared.items.length, 2);
  assert.deepEqual(prepared.items.map((item) => item.code), ["BLACK_STUDIO", "BRANDING"]);
  assert.deepEqual(prepared.items.map((item) => item.displayOrder), [0, 1]);
  assert.deepEqual(prepared.items.map((item) => item.total), [9_345_000, 0]);
});

test("legitimate deposit percentages calculate without forcing 50%", () => {
  const lines = ccuDraft().lines;
  assert.equal(calculateFormalQuote(lines, null, 0, 50).deposit, 5_560_275);
  assert.equal(calculateFormalQuote(lines, null, 0, 58).deposit, 6_449_919);
  assert.equal(calculateFormalQuote(lines, null, 0, 37.5).deposit, 4_170_206);
  assert.equal(calculateFormalQuote(lines, null, 0, 0).deposit, 0);
  assert.equal(calculateFormalQuote(lines, null, 0, 100).deposit, 11_120_550);
});

test("customer transport revenue remains in quote pricing without internal real-cost input", () => {
  const draft = ccuDraft();
  draft.lines = [{
    id: "transport",
    code: "TRANSPORT_CHACABUCO",
    description: "Traslado Chacabuco",
    quantity: 1,
    catalogPrice: 55_000,
    quotedPrice: 55_000,
    discountType: null,
    discountValue: 0,
    manual: false,
  }];
  const prepared = prepareFormalQuotePersistence(draft);
  assert.equal(prepared.calculation.net, 55_000);
  assert.equal(prepared.items[0].itemType, "TRANSPORT");
  assert.equal(prepared.items[0].quotedPrice, 55_000);
  assert.equal("realCost" in prepared.items[0], false);
});

test("canonical RPC is atomic, authenticated and idempotent by draft id", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/0165_commercial_quote_draft_persistence_fix.sql", import.meta.url), "utf8");
  const action = readFileSync(new URL("../../features/commercial-hub/actions.ts", import.meta.url), "utf8");
  const hub = readFileSync(new URL("../../features/commercial-hub/commercial-hub.tsx", import.meta.url), "utf8");
  assert.match(migration, /save_commercial_quote_draft/);
  assert.match(migration, /security definer/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /delete from public\.quotation_items/);
  assert.match(migration, /insert into public\.quotation_items/);
  assert.match(migration, /old\.status <> 'DRAFT' or new\.status <> 'DRAFT'/);
  assert.match(migration, /deposit_percent_value < 0 or deposit_percent_value > 100/);
  assert.match(action, /client\.rpc\(\s*"save_commercial_quote_draft"/);
  assert.match(action, /input\.quoteId \?\? input\.requestId \?\? crypto\.randomUUID\(\)/);
  assert.doesNotMatch(action, /client\.rpc\("update_commercial_quote_draft"/);
  assert.match(hub, /saveInFlightRef\.current/);
  assert.match(hub, /setPersistedQuoteId\(result\.id\)/);
  assert.match(hub, /Cotización actualizada correctamente/);
});

test("CCU PDF renders the canonical saved totals", async () => {
  const prepared = prepareFormalQuotePersistence(ccuDraft());
  const text = await pdfText(await createFormalQuotePdf({
    number: "2026-820",
    issueDate: "2026-08-24",
    expirationDate: "2026-09-03",
    customer: prepared.customerSnapshot,
    event: prepared.commercialSnapshot.event,
    lines: prepared.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      quotedPrice: item.quotedPrice,
      total: item.total,
    })),
    subtotal: prepared.calculation.subtotal,
    discount: prepared.calculation.discount,
    net: prepared.calculation.net,
    tax: prepared.calculation.vat,
    total: prepared.calculation.total,
    deposit: prepared.calculation.deposit,
    balance: prepared.calculation.balance,
    depositPercent: 58,
    company: {
      legalName: "PRODUCCIONES BOOMBOX COMPANY SpA",
      taxId: "76.565.272-3",
      address: "Puerta Oriente 361",
      city: "Colina",
      phone: "+56 9 6304 0989",
      email: "contabilidad@bbox.cl",
      website: "www.bbox.cl",
      bankName: "BCI",
      bankAccountType: "Cuenta Corriente",
      bankAccountNumber: "52093409",
      operationalConditions: [],
    },
  }));
  for (const expected of ["9.345.000", "1.775.550", "11.120.550", "6.449.919", "4.670.631", "58%"])
    assert.match(text, new RegExp(expected.replaceAll(".", "\\.")));
});
