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

test("simple commercial quote fits one readable A4 page", async () => {
  const pdf = await createFormalQuotePdf(model(2));
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
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

test("medium quote paginates naturally without an orphan closing", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(8)));
  assert.ok(texts.length >= 1 && texts.length <= 2);
  assert.match(texts.at(-1) ?? "", /FORMA DE PAGO/);
  assert.match(texts.at(-1) ?? "", /LISTOS PARA CREAR LA EXPERIENCIA/);
});

test("long quote uses intelligent multipage layout and keeps the final unit together", async () => {
  const texts = await pageTexts(await createFormalQuotePdf(model(22)));
  assert.ok(texts.length >= 2);
  assert.match(texts.at(-1) ?? "", /FORMA DE PAGO/);
  assert.match(texts.at(-1) ?? "", /LISTOS PARA CREAR LA EXPERIENCIA/);
});
