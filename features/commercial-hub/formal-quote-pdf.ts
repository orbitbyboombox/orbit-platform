import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface FormalQuotePdfModel {
  number: string;
  issueDate: string;
  expirationDate: string;
  customer: { company?: string; rut?: string; contact?: string; email?: string };
  event: { name?: string; date?: string };
  lines: Array<{ description: string; quantity: number; quotedPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
  deposit: number;
  balance: number;
  company: { legalName: string; taxId: string; address: string; phone: string; email: string; website: string; bankName: string; bankAccountType: string; bankAccountNumber: string };
}

const PAGE: [number, number] = [595.28, 841.89];
const orange = rgb(0.94, 0.43, 0.04);
const graphite = rgb(0.07, 0.075, 0.085);
const muted = rgb(0.38, 0.4, 0.45);
const line = rgb(0.88, 0.89, 0.91);
const safe = (value = "") => value.replace(/[^\x20-\x7EÀ-ÿ]/g, " ");
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

function header(page: PDFPage, regular: PDFFont, bold: PDFFont, model: FormalQuotePdfModel) {
  const height = page.getHeight();
  page.drawRectangle({ x: 0, y: height - 112, width: PAGE[0], height: 112, color: graphite });
  page.drawText("BOOMBOX®", { x: 42, y: height - 58, size: 24, font: bold, color: rgb(1, 1, 1) });
  page.drawText("EXPERIENCIAS PARA RECORDAR", { x: 42, y: height - 78, size: 7, font: regular, color: rgb(0.74, 0.75, 0.78) });
  page.drawText("COTIZACIÓN", { x: 404, y: height - 51, size: 18, font: bold, color: orange });
  page.drawText(safe(model.number.replace("COTIZACIÓN ", "")), { x: 404, y: height - 75, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Emisión ${model.issueDate} · Válida hasta ${model.expirationDate}`, { x: 300, y: height - 94, size: 7.5, font: regular, color: rgb(0.75, 0.76, 0.79) });
}

function footer(page: PDFPage, regular: PDFFont, model: FormalQuotePdfModel, pageNumber: number) {
  page.drawLine({ start: { x: 42, y: 38 }, end: { x: 553, y: 38 }, thickness: 0.7, color: line });
  page.drawText(safe(`${model.company.legalName} · ${model.company.website} · ${model.company.email}`), { x: 42, y: 23, size: 7, font: regular, color: muted });
  page.drawText(`${pageNumber}`, { x: 542, y: 23, size: 7, font: regular, color: muted });
}

export async function createFormalQuotePdf(model: FormalQuotePdfModel) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(PAGE);
  let pageNumber = 1;
  header(page, regular, bold, model);
  footer(page, regular, model, pageNumber);
  let y = 684;
  const identity = [model.customer.company, model.customer.rut, model.customer.contact, model.customer.email].filter(Boolean).map(safe);
  page.drawText("CLIENTE", { x: 42, y, size: 8, font: bold, color: orange });
  y -= 22;
  identity.forEach((value) => { page.drawText(value, { x: 42, y, size: 10, font: regular, color: graphite }); y -= 16; });
  if (model.event.name || model.event.date) { y -= 6; page.drawText(safe([model.event.name, model.event.date].filter(Boolean).join(" · ")), { x: 42, y, size: 9, font: bold, color: graphite }); y -= 26; }
  const tableHeader = () => {
    page.drawRectangle({ x: 42, y: y - 6, width: 511, height: 24, color: graphite });
    page.drawText("DESCRIPCIÓN", { x: 52, y, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("CANT.", { x: 365, y, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("P. UNITARIO", { x: 409, y, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("TOTAL", { x: 504, y, size: 8, font: bold, color: rgb(1, 1, 1) });
    y -= 30;
  };
  tableHeader();
  for (const item of model.lines) {
    if (y < 115) { page = pdf.addPage(PAGE); pageNumber += 1; header(page, regular, bold, model); footer(page, regular, model, pageNumber); y = 690; tableHeader(); }
    const description = safe(item.description).slice(0, 92);
    page.drawText(description, { x: 52, y, size: 9, font: regular, color: graphite, maxWidth: 300 });
    page.drawText(String(item.quantity), { x: 373, y, size: 9, font: regular, color: graphite });
    page.drawText(money(item.quotedPrice), { x: 409, y, size: 8, font: regular, color: graphite });
    page.drawText(money(item.total), { x: 494, y, size: 8, font: bold, color: graphite });
    y -= description.length > 62 ? 32 : 24;
    page.drawLine({ start: { x: 42, y: y + 8 }, end: { x: 553, y: y + 8 }, thickness: 0.4, color: line });
  }
  if (y < 285) { page = pdf.addPage(PAGE); pageNumber += 1; header(page, regular, bold, model); footer(page, regular, model, pageNumber); y = 690; }
  y -= 12;
  const totals: Array<[string, number, boolean?]> = [["Subtotal", model.subtotal], ...(model.discount ? [["Descuento", -model.discount] as [string, number]] : []), ["Neto", model.net], ["IVA 19%", model.tax], ["TOTAL", model.total, true], ["Abono para reservar", model.deposit], ["Saldo", model.balance]];
  totals.forEach(([labelText, value, strong]) => { page.drawText(labelText, { x: 350, y, size: strong ? 11 : 9, font: strong ? bold : regular, color: strong ? graphite : muted }); page.drawText(money(value), { x: 470, y, size: strong ? 12 : 9, font: bold, color: strong ? orange : graphite }); y -= strong ? 28 : 20; });
  y -= 8;
  page.drawRectangle({ x: 42, y: y - 92, width: 511, height: 100, color: rgb(0.965, 0.967, 0.971), borderColor: line, borderWidth: 0.7 });
  page.drawText("DATOS PARA TRANSFERENCIA", { x: 56, y: y - 12, size: 9, font: bold, color: orange });
  const bank = [model.company.legalName, `RUT ${model.company.taxId}`, `${model.company.bankName} · ${model.company.bankAccountType}`, `Cuenta ${model.company.bankAccountNumber}`, model.company.email];
  bank.forEach((value, index) => page.drawText(safe(value), { x: 56, y: y - 31 - index * 13, size: 8, font: index === 0 ? bold : regular, color: graphite }));
  return Buffer.from(await pdf.save());
}
