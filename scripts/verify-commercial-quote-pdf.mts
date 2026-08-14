import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { createFormalQuotePdf, type FormalQuotePdfModel } from "../features/commercial-hub/formal-quote-pdf.ts";

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
};
const line = (index: number) => ({ description: `Servicio Classic personalizado ${index + 1} con Branding y experiencia fotográfica BOOMBOX`, quantity: 4, quotedPrice: 250000, total: 1000000 });
const base: FormalQuotePdfModel = {
  number: "COTIZACIÓN 2026-000002",
  issueDate: "2026-08-14",
  expirationDate: "2026-08-24",
  customer: {}, event: {}, lines: [line(0)], subtotal: 1000000, discount: 0, net: 1000000, tax: 190000, total: 1190000, deposit: 595000, balance: 595000, depositPercent: 50, company,
};
const cases: Array<[string, FormalQuotePdfModel]> = [
  ["commercial-quote-minimal.pdf", { ...base, customer: { company: "BBOX SPA", email: "test@example.com" } }],
  ["commercial-quote-complete.pdf", { ...base, customer: { company: "BBOX SPA", rut: "76.565.272-3", contact: "Matías Maira", email: "test@example.com", phone: "+56 9 6304 0989", address: "Camino El Guanaco 4819" }, event: { name: "Proyecto corporativo", date: "2026-09-20", time: "20:30", location: "Centro de eventos", city: "Huechuraba" }, lines: [line(0), line(1), { description: "Branding por cuatro caras", quantity: 4, quotedPrice: 150000, total: 600000 }, { description: "Hora adicional", quantity: 1, quotedPrice: 100000, total: 100000 }], subtotal: 4700000, net: 4700000, tax: 893000, total: 5593000, deposit: 2796500, balance: 2796500 }],
  ["commercial-quote-multipage.pdf", { ...base, customer: { company: "Empresa de validación multipágina", rut: "76.565.272-3", contact: "Matías Maira", email: "test@example.com", phone: "+56 9 6304 0989", address: "Dirección extensa para validar altura dinámica" }, event: { name: "Activación nacional", date: "2026-09-20", time: "20:30", location: "Centro de eventos", city: "Santiago" }, lines: Array.from({ length: 24 }, (_, index) => line(index)), subtotal: 24000000, net: 24000000, tax: 4560000, total: 28560000, deposit: 14280000, balance: 14280000 }],
];
for (const [filename, model] of cases) {
  const bytes = await createFormalQuotePdf(model);
  const loaded = await PDFDocument.load(bytes);
  if (filename.includes("multipage") && loaded.getPageCount() < 2) throw new Error("Multipage case did not paginate.");
  await writeFile(join(destination, filename), bytes);
  console.log(`${filename}: ${loaded.getPageCount()} page(s), ${bytes.length} bytes`);
}
