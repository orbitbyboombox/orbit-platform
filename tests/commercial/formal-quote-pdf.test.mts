import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createFormalQuotePdf,
  type FormalQuotePdfModel,
} from "../../features/commercial-hub/formal-quote-pdf.ts";
import {
  DEFAULT_QUOTE_OPERATIONAL_CONDITIONS,
  formatQuoteOperationalConditions,
  parseQuoteOperationalConditions,
} from "../../features/commercial-hub/operational-conditions.ts";

const model = (lineCount: number): FormalQuotePdfModel => ({
  number: "COTIZACIÓN 2026-000003",
  issueDate: "2026-08-14",
  expirationDate: "2026-08-24",
  customer: {
    company: "Cliente BOOMBOX SpA",
    rut: "76.000.000-0",
    contact: "María González",
    email: "maria@example.com",
    phone: "+56 9 1234 5678",
    address: "Av. Siempre Viva 123",
  },
  event: {
    name: "Evento Corporativo",
    date: "2026-09-20",
    time: "20:00",
    location: "Centro de Eventos",
    city: "Santiago",
  },
  lines: Array.from({ length: lineCount }, (_, index) => ({
    description: `Servicio BOOMBOX ${index + 1} con descripción comercial`,
    quantity: 1,
    quotedPrice: 100_000,
    total: 100_000,
  })),
  subtotal: lineCount * 100_000,
  discount: 0,
  net: lineCount * 100_000,
  tax: lineCount * 19_000,
  total: lineCount * 119_000,
  deposit: lineCount * 59_500,
  balance: lineCount * 59_500,
  depositPercent: 50,
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
    operationalConditions: DEFAULT_QUOTE_OPERATIONAL_CONDITIONS,
  },
});

async function pageTexts(pdf: Uint8Array) {
  const document = await getDocument({ data: Uint8Array.from(pdf) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" "),
    );
  }
  await document.destroy();
  return pages;
}

test("simple commercial quote always uses two deliberate A4 pages", async () => {
  const pdf = await createFormalQuotePdf(model(2));
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 2);
});

test("page one ends with commercial total and excludes reservation details", async () => {
  const [first] = await pageTexts(await createFormalQuotePdf(model(3)));
  assert.match(first, /TOTAL PROPUESTA/);
  for (const forbidden of ["ABONO PARA RESERVAR", "SALDO PENDIENTE", "CONDICIONES DE RESERVA", "FORMA DE PAGO", "LISTOS PARA CREAR LA EXPERIENCIA"]) assert.doesNotMatch(first, new RegExp(forbidden));
});

test("final page contains complete reservation and conditions composition", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(3)));
  const last = texts.at(-1) ?? "";
  for (const expected of ["RESUMEN DE RESERVA", "TOTAL PROPUESTA", "ABONO PARA RESERVAR", "SALDO PENDIENTE", "CONDICIONES DE RESERVA", "CONDICIONES OPERACIONALES", "FORMA DE PAGO", "IMPORTANTE", "LISTOS PARA CREAR LA EXPERIENCIA"]) assert.match(last, new RegExp(expected));
});

test("every page includes elegant total page numbering", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(3)));
  texts.forEach((text, index) => assert.match(text, new RegExp(`${index + 1} \/ ${texts.length}`)));
});

test("operational conditions and final blocks follow the approved order", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(2)));
  const text = texts.join(" ");
  const reservation = text.indexOf("CONDICIONES DE RESERVA");
  const operational = text.indexOf("CONDICIONES OPERACIONALES");
  const payment = text.indexOf("FORMA DE PAGO");
  const closing = text.indexOf("LISTOS PARA CREAR LA EXPERIENCIA");
  assert.ok(reservation >= 0 && reservation < operational);
  assert.ok(operational < payment && payment < closing);
  for (const expected of [
    "Montaje y desmontaje",
    "Acceso",
    "Energía",
    "Carga, descarga y estacionamiento",
    "2,30 m de altura",
    "Espacio de instalación",
    "Cambios operacionales",
  ])
    assert.ok(text.includes(expected));
});

test("operational conditions remain Founder configurable", () => {
  const configured = parseQuoteOperationalConditions(
    "Acceso especial: Coordinar por portería.\n\nEnergía: Usar enchufe directo.",
  );
  assert.deepEqual(configured, [
    { label: "Acceso especial", text: "Coordinar por portería." },
    { label: "Energía", text: "Usar enchufe directo." },
  ]);
  assert.match(
    formatQuoteOperationalConditions(configured),
    /Acceso especial: Coordinar por portería/,
  );
});

test("medium quote keeps an independent final conditions page", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(8)));
  assert.ok(texts.length >= 2);
  assert.match(texts.at(-1) ?? "", /FORMA DE PAGO/);
  assert.match(texts.at(-1) ?? "", /LISTOS PARA CREAR LA EXPERIENCIA/);
});

test("long quote uses intelligent multipage layout and keeps the final unit together", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(22)));
  assert.ok(texts.length >= 2);
  assert.match(texts.at(-1) ?? "", /FORMA DE PAGO/);
  assert.match(texts.at(-1) ?? "", /LISTOS PARA CREAR LA EXPERIENCIA/);
  assert.doesNotMatch(texts[0], /CONDICIONES DE RESERVA/);
});
