import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  createFormalQuotePdf,
  type FormalQuotePdfModel,
} from "../features/commercial-hub/formal-quote-pdf.ts";
import { DEFAULT_QUOTE_OPERATIONAL_CONDITIONS } from "../features/commercial-hub/operational-conditions.ts";

const destination = process.argv[2];
if (!destination) throw new Error("Destination directory is required.");
await mkdir(destination, { recursive: true });

const company: FormalQuotePdfModel["company"] = {
  legalName: "PRODUCCIONES BOOMBOX COMPANY SpA",
  taxId: "76.565.272-3",
  address: "Puerta Oriente 361 · Puertas de Chicureo",
  city: "Colina",
  phone: "+56 9 6304 0989",
  email: "contabilidad@bbox.cl",
  website: "www.bbox.cl",
  bankName: "BCI",
  bankAccountType: "Cuenta Corriente",
  bankAccountNumber: "52093409",
  operationalConditions: DEFAULT_QUOTE_OPERATIONAL_CONDITIONS,
};
const line = (index: number) => ({
  description: `Servicio Classic personalizado ${index + 1} con Branding y experiencia fotográfica BOOMBOX`,
  quantity: 4,
  quotedPrice: 250000,
  total: 1000000,
});
const base: FormalQuotePdfModel = {
  number: "COTIZACIÓN 2026-000002",
  issueDate: "2026-08-14",
  expirationDate: "2026-08-24",
  customer: {},
  event: {},
  lines: [line(0)],
  subtotal: 1000000,
  discount: 0,
  net: 1000000,
  tax: 190000,
  total: 1190000,
  deposit: 595000,
  balance: 595000,
  depositPercent: 50,
  company,
};
const cases: Array<[string, FormalQuotePdfModel]> = [
  [
    "commercial-quote-simple.pdf",
    {
      ...base,
      customer: {
        company: "BBOX SPA",
        rut: "76.565.272-3",
        contact: "Matías Maira",
        email: "test@example.com",
        phone: "+56 9 6304 0989",
        address: "Camino El Guanaco 4819",
      },
      event: {
        name: "Proyecto corporativo",
        date: "2026-09-20",
        time: "20:30",
        location: "Centro de eventos",
        city: "Huechuraba",
      },
      lines: [line(0), line(1), line(2)],
      subtotal: 3000000,
      net: 3000000,
      tax: 570000,
      total: 3570000,
      deposit: 1785000,
      balance: 1785000,
    },
  ],
  [
    "commercial-quote-medium.pdf",
    {
      ...base,
      customer: {
        company: "BBOX SPA",
        contact: "Matías Maira",
        email: "test@example.com",
      },
      lines: Array.from({ length: 8 }, (_, index) => line(index)),
      subtotal: 8000000,
      net: 8000000,
      tax: 1520000,
      total: 9520000,
      deposit: 4760000,
      balance: 4760000,
    },
  ],
  [
    "commercial-quote-multipage.pdf",
    {
      ...base,
      customer: {
        company: "Empresa de validación multipágina",
        rut: "76.565.272-3",
        contact: "Matías Maira",
        email: "test@example.com",
        phone: "+56 9 6304 0989",
        address: "Dirección extensa para validar altura dinámica",
      },
      event: {
        name: "Activación nacional",
        date: "2026-09-20",
        time: "20:30",
        location: "Centro de eventos",
        city: "Santiago",
      },
      lines: Array.from({ length: 22 }, (_, index) => line(index)),
      subtotal: 22000000,
      net: 22000000,
      tax: 4180000,
      total: 26180000,
      deposit: 13090000,
      balance: 13090000,
    },
  ],
];
for (const [filename, model] of cases) {
  const bytes = await createFormalQuotePdf(model);
  const loaded = await PDFDocument.load(bytes);
  await writeFile(join(destination, filename), bytes);
  if (filename.includes("simple") && loaded.getPageCount() !== 2)
    throw new Error("Simple case did not preserve the mandatory two-page layout.");
  if (filename.includes("medium") && loaded.getPageCount() < 2)
    throw new Error("Medium case lost the independent conditions page.");
  if (filename.includes("multipage") && loaded.getPageCount() < 3)
    throw new Error("Multipage case did not paginate.");
  console.log(
    `${filename}: ${loaded.getPageCount()} page(s), ${bytes.length} bytes`,
  );
}
