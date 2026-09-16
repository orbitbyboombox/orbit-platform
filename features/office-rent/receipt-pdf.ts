import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CompanySettings } from "@/features/company-settings";
import type { OfficeLeaseSettings } from "./model.ts";
import { formatClp, monthLabel, receiptLabel } from "./model.ts";

export interface OfficeLeaseReceiptInput {
  settings: OfficeLeaseSettings;
  company: Pick<CompanySettings, "brandName" | "legalName" | "taxId" | "address" | "city">;
  payment: {
    receiptNumber: number;
    paidOn: string;
    amount: number;
    paymentMethod: string;
    observation: string;
    lineItems: Array<{
      itemType: "RENT" | "SECURITY_DEPOSIT";
      description: string;
      detail: string;
      amount: number;
    }>;
  };
  period: string;
}

const PAGE = { width: 595.28, height: 841.89 };
const orange = rgb(0.96, 0.49, 0.05);
const dark = rgb(0.08, 0.08, 0.09);
const muted = rgb(0.38, 0.38, 0.4);
const line = rgb(0.84, 0.84, 0.85);
const soft = rgb(0.985, 0.96, 0.92);
const green = rgb(0.04, 0.55, 0.25);

const safe = (value: string) =>
  value.replace(/[–—]/g, "-").replace(/N\.º/g, "N.o").replace(/\s+/g, " ").trim();

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const shortDate = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).toUpperCase().replaceAll(".", "");

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = safe(text).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, width: number, color = dark, leading = size + 3) {
  const lines = wrap(font, text, size, width);
  lines.forEach((item, index) => page.drawText(item, { x, y: y - index * leading, size, font, color }));
  return y - lines.length * leading;
}

function field(page: PDFPage, regular: PDFFont, bold: PDFFont, label: string, value: string, x: number, y: number, width: number) {
  page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: bold, color: muted });
  drawWrapped(page, regular, value || "No informado", x, y - 15, 9.2, width, dark, 12);
}

export async function createOfficeLeaseReceiptPdf(input: OfficeLeaseReceiptInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const { settings, company, payment } = input;
  const lineItems = payment.lineItems.length
    ? payment.lineItems
    : [{ itemType: "RENT" as const, description: settings.concept, detail: monthLabel(input.period), amount: payment.amount }];
  const margin = 46;
  const contentWidth = PAGE.width - margin * 2;

  page.drawText(safe(company.brandName || "BOOMBOX").toUpperCase(), { x: margin, y: 784, size: 19, font: bold, color: dark });
  page.drawText("COMPROBANTE DE PAGO", { x: 336, y: 788, size: 10, font: bold, color: dark });
  page.drawText("ARRIENDO DE OFICINA", { x: 336, y: 772, size: 9, font: regular, color: muted });
  page.drawLine({ start: { x: margin, y: 758 }, end: { x: PAGE.width - margin, y: 758 }, thickness: 1.6, color: orange });
  const receiptTitle = `RECIBO ${receiptLabel(payment.receiptNumber)}`;
  page.drawText(receiptTitle, { x: (PAGE.width - bold.widthOfTextAtSize(receiptTitle, 18)) / 2, y: 717, size: 18, font: bold, color: dark });
  page.drawText("RECIBO DE INGRESO · Comprobante de recepción conforme", { x: 169, y: 698, size: 9, font: regular, color: muted });

  page.drawRectangle({ x: margin, y: 620, width: contentWidth, height: 58, color: rgb(0.965, 0.965, 0.97), borderColor: line, borderWidth: 0.6 });
  field(page, regular, bold, "Fecha de emisión", dateLabel(payment.paidOn), 55, 657, 145);
  field(page, regular, bold, "Comprobante", receiptLabel(payment.receiptNumber), 215, 657, 90);
  field(page, regular, bold, "Inmueble", settings.unitName, 322, 657, 90);
  field(page, regular, bold, "Dirección", settings.propertyAddress, 416, 657, 120);

  page.drawText("DATOS DE LA PARTE ARRENDATARIA", { x: margin, y: 595, size: 8.5, font: bold, color: muted });
  page.drawRectangle({ x: margin, y: 510, width: contentWidth, height: 71, borderColor: line, borderWidth: 0.7 });
  field(page, regular, bold, "Razón social / nombre", settings.tenantLegalName, 55, 563, 255);
  field(page, regular, bold, "RUT", settings.tenantRut, 350, 563, 165);
  field(page, regular, bold, "Representante", settings.tenantRepresentative || "No aplica", 55, 533, 255);
  field(page, regular, bold, "Correo", settings.tenantEmail || "No informado", 350, 533, 165);

  page.drawText("DETALLE DEL PAGO", { x: margin, y: 492, size: 8.5, font: bold, color: muted });
  page.drawRectangle({ x: margin, y: 446, width: contentWidth, height: 28, color: dark });
  page.drawText("CONCEPTO", { x: 55, y: 456, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("PERIODO / DETALLE", { x: 263, y: 456, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("MONTO", { x: 476, y: 456, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: margin, y: 350, width: contentWidth, height: 96, borderColor: line, borderWidth: 0.7 });
  lineItems.slice(0, 2).forEach((item, index) => {
    const rowTop = 436 - index * 48;
    if (index > 0) page.drawLine({ start: { x: margin, y: rowTop + 10 }, end: { x: PAGE.width - margin, y: rowTop + 10 }, thickness: 0.5, color: line });
    drawWrapped(page, regular, item.description, 55, rowTop, 9.2, 195, dark, 11.5);
    drawWrapped(page, regular, item.detail || monthLabel(input.period), 263, rowTop, 8.8, 180, muted, 11);
    const amount = formatClp(item.amount);
    page.drawText(amount, { x: 530 - bold.widthOfTextAtSize(amount, 10.5), y: rowTop - 7, size: 10.5, font: bold, color: dark });
  });
  page.drawRectangle({ x: margin, y: 305, width: contentWidth, height: 33, color: soft, borderColor: orange, borderWidth: 1 });
  page.drawText("TOTAL RECIBIDO", { x: 56, y: 316, size: 12, font: bold, color: dark });
  const total = formatClp(payment.amount);
  page.drawText(total, { x: 530 - bold.widthOfTextAtSize(total, 13), y: 316, size: 13, font: bold, color: dark });

  const concepts = lineItems.map((item) => item.description.toLowerCase()).join(" y ");
  const statement = `Se deja constancia de la recepción conforme de la suma total indicada, correspondiente a ${concepts}. El presente documento constituye un comprobante de ingreso y recepción de pago.${payment.observation ? ` Observación: ${payment.observation}` : ""}`;
  drawWrapped(page, regular, statement, margin + 6, 276, 9.2, contentWidth - 12, dark, 13);

  page.drawLine({ start: { x: margin, y: 176 }, end: { x: 318, y: 176 }, thickness: 0.7, color: muted });
  page.drawText(safe(company.legalName || company.brandName).toUpperCase(), { x: 52, y: 153, size: 9.5, font: bold, color: dark });
  page.drawText(company.taxId ? `RUT ${safe(company.taxId)}` : "Arrendador BOOMBOX", { x: 52, y: 138, size: 8.8, font: regular, color: dark });
  drawWrapped(page, regular, [company.address, company.city].filter(Boolean).join(", ") || settings.unitName, 52, 123, 8.3, 260, muted, 11);

  page.drawRectangle({ x: 358, y: 107, width: 177, height: 78, borderColor: green, borderWidth: 1.8 });
  page.drawText("PAGADO", { x: 397, y: 151, size: 19, font: bold, color: green });
  page.drawText(shortDate(payment.paidOn), { x: 413, y: 132, size: 9, font: bold, color: green });
  page.drawText("RECIBIDO CONFORME", { x: 402, y: 116, size: 7.5, font: regular, color: green });

  page.drawText("Documento emitido por BOOMBOX mediante ORBIT. Valores expresados en pesos chilenos (CLP).", { x: 106, y: 38, size: 7.4, font: regular, color: muted });
  page.drawText(`ID documental ${receiptLabel(payment.receiptNumber)}`, { x: 242, y: 24, size: 6.8, font: regular, color: muted });
  return Buffer.from(await pdf.save());
}
