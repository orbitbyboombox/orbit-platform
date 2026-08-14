import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface FormalQuotePdfModel {
  number: string;
  issueDate: string;
  expirationDate: string;
  customer: { company?: string; rut?: string; contact?: string; email?: string; phone?: string; address?: string };
  event: { name?: string; date?: string; time?: string; location?: string; city?: string };
  lines: Array<{ description: string; quantity: number; quotedPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
  deposit: number;
  balance: number;
  depositPercent?: number;
  company: { legalName: string; taxId: string; address: string; city?: string; phone: string; email: string; website: string; bankName: string; bankAccountType: string; bankAccountNumber: string; reservationConditions?: string[] };
}

const PAGE: [number, number] = [595.28, 841.89];
const orange = rgb(0.94, 0.43, 0.04);
const graphite = rgb(0.07, 0.075, 0.085);
const muted = rgb(0.38, 0.4, 0.45);
const rule = rgb(0.88, 0.89, 0.91);
const white = rgb(1, 1, 1);
const safe = (value = "") => value.replace(/[^\x20-\x7EÀ-ÿ]/g, " ").trim();
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => value ? value.split("-").reverse().join("-") : "";

function rightText(page: PDFPage, value: string, right: number, y: number, size: number, font: PDFFont, color = graphite) {
  const text = safe(value);
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function header(page: PDFPage, regular: PDFFont, bold: PDFFont, model: FormalQuotePdfModel) {
  const top = page.getHeight();
  page.drawRectangle({ x: 0, y: top - 132, width: PAGE[0], height: 132, color: graphite });
  page.drawText("BOOMBOX®", { x: 42, y: top - 48, size: 24, font: bold, color: white });
  const identity = [
    model.company.legalName.toUpperCase(),
    model.company.taxId ? `RUT ${model.company.taxId}` : "",
    [model.company.address, model.company.city].filter(Boolean).join(" · "),
    [model.company.phone, model.company.website].filter(Boolean).join(" · "),
  ].filter(Boolean);
  identity.forEach((item, index) => page.drawText(safe(item), { x: 42, y: top - 68 - index * 12, size: 6.7, font: index === 0 ? bold : regular, color: rgb(0.78, 0.8, 0.84) }));
  const right = 553;
  rightText(page, "COTIZACIÓN", right, top - 45, 18, bold, orange);
  rightText(page, model.number.replace(/^COTIZACI[ÓO]N\s*/i, ""), right, top - 67, 11, bold, white);
  rightText(page, `Emisión: ${date(model.issueDate)}`, right, top - 88, 7.5, regular, rgb(0.75, 0.76, 0.79));
  rightText(page, `Válida hasta: ${date(model.expirationDate)}`, right, top - 102, 7.5, regular, rgb(0.75, 0.76, 0.79));
}

function footer(page: PDFPage, regular: PDFFont, model: FormalQuotePdfModel, pageNumber: number) {
  page.drawLine({ start: { x: 42, y: 38 }, end: { x: 553, y: 38 }, thickness: 0.7, color: rule });
  page.drawText(safe([model.company.legalName, model.company.website, model.company.email].filter(Boolean).join(" · ")), { x: 42, y: 23, size: 7, font: regular, color: muted, maxWidth: 470 });
  rightText(page, String(pageNumber), 553, 23, 7, regular, muted);
}

const defaultConditions = (model: FormalQuotePdfModel) => [
  `Para confirmar la reserva se requiere el abono indicado en esta cotización${model.depositPercent != null ? ` (${model.depositPercent}%)` : ""}.`,
  "El saldo pendiente deberá pagarse según las condiciones comerciales acordadas para el evento.",
  "La propuesta mantiene su vigencia hasta la fecha indicada en el encabezado.",
  "Los valores, cantidades y servicios detallados corresponden exclusivamente a esta cotización.",
  "Cualquier precio especial o descuento aplicado corresponde únicamente a esta propuesta y no modifica las tarifas generales de BOOMBOX.",
];

export async function createFormalQuotePdf(model: FormalQuotePdfModel) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(PAGE);
  let y = 682;
  let pageNumber = 1;
  const nextPage = () => {
    page = pdf.addPage(PAGE);
    pageNumber += 1;
    header(page, regular, bold, model);
    footer(page, regular, model, pageNumber);
    y = 682;
  };
  const ensure = (height: number) => { if (y - height < 56) nextPage(); };
  const heading = (text: string) => { ensure(28); page.drawText(text, { x: 42, y, size: 8.5, font: bold, color: orange }); y -= 20; };
  const paragraph = (text: string, options: { size?: number; bold?: boolean; indent?: number } = {}) => {
    const size = options.size ?? 8.5;
    const font = options.bold ? bold : regular;
    const indent = options.indent ?? 0;
    const lines = wrap(text, font, size, 511 - indent);
    ensure(lines.length * 13 + 4);
    lines.forEach((item) => { page.drawText(item, { x: 42 + indent, y, size, font, color: graphite }); y -= 13; });
  };

  header(page, regular, bold, model);
  footer(page, regular, model, pageNumber);
  heading("CLIENTE");
  const customerRows = [
    model.customer.company,
    model.customer.rut,
    model.customer.contact,
    model.customer.email,
    model.customer.phone,
    model.customer.address,
    model.event.name,
    model.event.date ? `Fecha: ${date(model.event.date)}` : "",
    model.event.time ? `Hora: ${model.event.time}` : "",
    [model.event.location, model.event.city].filter(Boolean).join(" · "),
  ].filter((item): item is string => Boolean(item?.trim()));
  customerRows.forEach((item, index) => paragraph(item, { bold: index === 0, size: index === 0 ? 10.5 : 8.5 }));
  y -= 12;

  const tableHeader = () => {
    ensure(34);
    page.drawRectangle({ x: 42, y: y - 5, width: 511, height: 24, color: graphite });
    page.drawText("DESCRIPCIÓN", { x: 52, y: y + 2, size: 8, font: bold, color: white });
    rightText(page, "CANT.", 382, y + 2, 8, bold, white);
    rightText(page, "P. UNITARIO", 462, y + 2, 8, bold, white);
    rightText(page, "TOTAL", 543, y + 2, 8, bold, white);
    y -= 30;
  };
  tableHeader();
  for (const item of model.lines) {
    const descriptions = wrap(item.description, regular, 8.5, 265);
    const rowHeight = Math.max(24, descriptions.length * 12 + 8);
    if (y - rowHeight < 56) { nextPage(); tableHeader(); }
    descriptions.forEach((text, index) => page.drawText(text, { x: 52, y: y - index * 12, size: 8.5, font: regular, color: graphite }));
    rightText(page, String(item.quantity), 376, y, 8.5, regular);
    rightText(page, money(item.quotedPrice), 462, y, 7.5, regular);
    rightText(page, money(item.total), 543, y, 7.5, bold);
    y -= rowHeight;
    page.drawLine({ start: { x: 42, y: y + 6 }, end: { x: 553, y: y + 6 }, thickness: 0.4, color: rule });
  }

  ensure(210);
  y -= 8;
  const totals: Array<[string, number, boolean?]> = [
    ["Subtotal", model.subtotal],
    ...(model.discount ? [["Descuento", -model.discount] as [string, number]] : []),
    ["Neto", model.net], ["IVA 19%", model.tax], ["TOTAL PROPUESTA", model.total, true],
  ];
  totals.forEach(([label, value, strong]) => {
    page.drawText(label, { x: 342, y, size: strong ? 11 : 8.5, font: strong ? bold : regular, color: strong ? graphite : muted });
    rightText(page, money(value), 553, y, strong ? 15 : 9, bold, strong ? orange : graphite);
    y -= strong ? 30 : 19;
  });
  page.drawLine({ start: { x: 342, y: y + 8 }, end: { x: 553, y: y + 8 }, thickness: 1, color: orange });
  [["ABONO PARA RESERVAR", model.deposit], ["SALDO", model.balance]].forEach(([label, value]) => {
    page.drawText(String(label), { x: 342, y, size: 9, font: bold, color: graphite });
    rightText(page, money(Number(value)), 553, y, 10, bold);
    y -= 22;
  });
  y -= 10;

  heading("CONDICIONES DE RESERVA");
  const conditions = model.company.reservationConditions?.length ? model.company.reservationConditions : defaultConditions(model);
  conditions.forEach((item) => paragraph(`• ${item}`, { size: 8, indent: 4 }));
  y -= 8;

  ensure(130);
  heading("FORMA DE PAGO");
  const bankRows = [model.company.legalName, model.company.taxId ? `RUT ${model.company.taxId}` : "", model.company.bankName, model.company.bankAccountType, model.company.bankAccountNumber ? `N.º ${model.company.bankAccountNumber}` : "", model.company.email].filter(Boolean);
  bankRows.forEach((item, index) => paragraph(item, { size: 8.5, bold: index === 0 }));
  y -= 10;

  ensure(90);
  heading("¿LISTOS PARA CREAR LA EXPERIENCIA?");
  paragraph("Para continuar con esta propuesta, responde este correo o avanza con el proceso de reserva BOOMBOX.", { size: 9 });
  y -= 6;
  paragraph("16 años creando experiencias que se recuerdan.", { size: 10, bold: true });
  return Buffer.from(await pdf.save());
}
