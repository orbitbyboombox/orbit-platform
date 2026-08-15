import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { QuoteOperationalCondition } from "./operational-conditions";

export interface FormalQuotePdfModel {
  number: string;
  issueDate: string;
  expirationDate: string;
  customer: {
    company?: string;
    rut?: string;
    contact?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  event: {
    name?: string;
    date?: string;
    time?: string;
    location?: string;
    city?: string;
  };
  lines: Array<{
    description: string;
    quantity: number;
    quotedPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
  deposit: number;
  balance: number;
  depositPercent?: number;
  company: {
    legalName: string;
    taxId: string;
    address: string;
    city?: string;
    phone: string;
    email: string;
    website: string;
    bankName: string;
    bankAccountType: string;
    bankAccountNumber: string;
    importantNotice?: string;
    reservationConditions?: string[];
    operationalConditions: QuoteOperationalCondition[];
  };
}

const PAGE: [number, number] = [595.28, 841.89];
const orange = rgb(0.94, 0.43, 0.04);
const graphite = rgb(0.07, 0.075, 0.085);
const muted = rgb(0.38, 0.4, 0.45);
const rule = rgb(0.88, 0.89, 0.91);
const white = rgb(1, 1, 1);
const safe = (value = "") => value.replace(/[^\x20-\x7EÀ-ÿ]/g, " ").trim();
const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const date = (value: string) =>
  value ? value.split("-").reverse().join("-") : "";

function rightText(
  page: PDFPage,
  value: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color = graphite,
) {
  const text = safe(value);
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function header(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  model: FormalQuotePdfModel,
) {
  const top = page.getHeight();
  page.drawRectangle({
    x: 0,
    y: top - 132,
    width: PAGE[0],
    height: 132,
    color: graphite,
  });
  page.drawText("BOOMBOX®", {
    x: 42,
    y: top - 48,
    size: 24,
    font: bold,
    color: white,
  });
  const identity = [
    model.company.legalName.toUpperCase(),
    model.company.taxId ? `RUT ${model.company.taxId}` : "",
    [model.company.address, model.company.city].filter(Boolean).join(" · "),
    [model.company.phone, model.company.website].filter(Boolean).join(" · "),
  ].filter(Boolean);
  identity.forEach((item, index) =>
    page.drawText(safe(item), {
      x: 42,
      y: top - 68 - index * 12,
      size: 6.7,
      font: index === 0 ? bold : regular,
      color: rgb(0.78, 0.8, 0.84),
    }),
  );
  const right = 553;
  rightText(page, "COTIZACIÓN", right, top - 45, 18, bold, orange);
  rightText(
    page,
    model.number.replace(/^COTIZACI[ÓO]N\s*/i, ""),
    right,
    top - 67,
    11,
    bold,
    white,
  );
  rightText(
    page,
    `Emisión: ${date(model.issueDate)}`,
    right,
    top - 88,
    7.5,
    regular,
    rgb(0.75, 0.76, 0.79),
  );
  rightText(
    page,
    `Válida hasta: ${date(model.expirationDate)}`,
    right,
    top - 102,
    7.5,
    regular,
    rgb(0.75, 0.76, 0.79),
  );
}

function footer(
  page: PDFPage,
  regular: PDFFont,
  model: FormalQuotePdfModel,
  pageNumber: number,
  totalPages: number,
) {
  page.drawLine({
    start: { x: 42, y: 38 },
    end: { x: 553, y: 38 },
    thickness: 0.7,
    color: rule,
  });
  page.drawText(
    safe(
      [model.company.legalName, model.company.website, model.company.email]
        .filter(Boolean)
        .join(" · "),
    ),
    { x: 42, y: 23, size: 7, font: regular, color: muted, maxWidth: 470 },
  );
  rightText(page, `${pageNumber} / ${totalPages}`, 553, 23, 7, regular, muted);
}

function compactHeader(page: PDFPage, regular: PDFFont, bold: PDFFont, model: FormalQuotePdfModel) {
  const top = page.getHeight();
  page.drawRectangle({ x: 0, y: top - 92, width: PAGE[0], height: 92, color: graphite });
  page.drawText("BOOMBOX®", { x: 42, y: top - 47, size: 22, font: bold, color: white });
  rightText(page, safe(model.number), 553, top - 42, 11, bold, orange);
  rightText(page, "RESERVA Y CONDICIONES", 553, top - 61, 7.5, regular, rgb(0.78, 0.8, 0.84));
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

  const newServicePage = () => {
    page = pdf.addPage(PAGE);
    header(page, regular, bold, model);
    y = 682;
  };
  const ensureService = (height: number) => {
    if (y - height < 58) newServicePage();
  };
  const serviceHeading = (text: string) => {
    ensureService(30);
    page.drawText(text, { x: 42, y, size: 8.5, font: bold, color: orange });
    y -= 17;
  };
  const serviceParagraph = (text: string, options: { size?: number; bold?: boolean; lineHeight?: number } = {}) => {
    const size = options.size ?? 8;
    const font = options.bold ? bold : regular;
    const lineHeight = options.lineHeight ?? 9;
    const lines = wrap(text, font, size, 511);
    ensureService(lines.length * lineHeight);
    lines.forEach((line) => { page.drawText(line, { x: 42, y, size, font, color: graphite }); y -= lineHeight; });
  };

  header(page, regular, bold, model);
  serviceHeading("CLIENTE");
  const customerRows = [model.customer.company, model.customer.rut, model.customer.contact, model.customer.email, model.customer.phone, model.customer.address, model.event.name, model.event.date ? `Fecha: ${date(model.event.date)}` : "", model.event.time ? `Hora: ${model.event.time}` : "", [model.event.location, model.event.city].filter(Boolean).join(" · ")].filter((item): item is string => Boolean(item?.trim()));
  customerRows.forEach((item, index) => serviceParagraph(item, { bold: index === 0, size: index === 0 ? 10 : 8, lineHeight: index === 0 ? 12 : 9 }));
  y = Math.min(y - 28, 536);

  const tableHeader = (continuation = false) => {
    ensureService(38);
    if (continuation) { page.drawText("CONTINUACIÓN DE SERVICIOS", { x: 42, y: y + 25, size: 7.5, font: bold, color: orange }); }
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
    const rowHeight = Math.max(25, descriptions.length * 10 + 8);
    if (y - rowHeight < 58) { newServicePage(); tableHeader(true); }
    descriptions.forEach((text, index) => page.drawText(text, { x: 52, y: y - index * 10, size: 8.2, font: regular, color: graphite }));
    rightText(page, String(item.quantity), 376, y, 8.5, regular);
    rightText(page, money(item.quotedPrice), 462, y, 7.5, regular);
    rightText(page, money(item.total), 543, y, 7.5, bold);
    y -= rowHeight;
    page.drawLine({ start: { x: 42, y: y + 6 }, end: { x: 553, y: y + 6 }, thickness: 0.4, color: rule });
  }

  ensureService(model.discount ? 122 : 106);
  y -= 8;
  const totals: Array<[string, number, boolean?]> = [["Subtotal", model.subtotal], ...(model.discount ? [["Descuento", -model.discount] as [string, number]] : []), ["Neto", model.net], ["IVA 19%", model.tax], ["TOTAL PROPUESTA", model.total, true]];
  totals.forEach(([label, value, strong]) => {
    page.drawText(label, { x: 342, y, size: strong ? 11 : 8.5, font: strong ? bold : regular, color: strong ? graphite : muted });
    rightText(page, money(value), 553, y, strong ? 15 : 9, bold, strong ? orange : graphite);
    y -= strong ? 26 : 16;
  });
  page.drawLine({ start: { x: 342, y: y + 10 }, end: { x: 553, y: y + 10 }, thickness: 1.2, color: orange });

  // Reservation and conditions deliberately start on an independent final page.
  page = pdf.addPage(PAGE);
  compactHeader(page, regular, bold, model);
  y = 720;
  const finalHeading = (text: string) => { page.drawText(text, { x: 42, y, size: 9, font: bold, color: orange }); y -= 15; };
  const drawWrapped = (text: string, x: number, width: number, size = 8, lineHeight = 10, font = regular, color = graphite) => {
    const lines = wrap(text, font, size, width);
    lines.forEach((line) => { page.drawText(line, { x, y, size, font, color }); y -= lineHeight; });
  };

  finalHeading("RESUMEN DE RESERVA");
  const cards: Array<[string, number, boolean?]> = [["TOTAL PROPUESTA", model.total, true], [`ABONO PARA RESERVAR - ${model.depositPercent ?? 50}%`, model.deposit], ["SALDO PENDIENTE", model.balance]];
  cards.forEach(([label, value, emphasized], index) => {
    const x = 42 + index * 174;
    page.drawRectangle({ x, y: y - 56, width: 163, height: 68, color: emphasized ? rgb(0.995, 0.94, 0.89) : rgb(0.96, 0.965, 0.975), borderColor: emphasized ? orange : rule, borderWidth: emphasized ? 1 : 0.6 });
    page.drawText(label, { x: x + 11, y: y - 12, size: 6.8, font: bold, color: emphasized ? orange : muted, maxWidth: 141 });
    page.drawText(money(value), { x: x + 11, y: y - 39, size: 13, font: bold, color: graphite, maxWidth: 141 });
  });
  y -= 72;

  const drawBulletColumns = (title: string, items: string[], size = 7.8, lineHeight = 9.7) => {
    finalHeading(title);
    const width = 244;
    const gap = 23;
    const split = Math.ceil(items.length / 2);
    const columns = [items.slice(0, split), items.slice(split)];
    const top = y;
    let bottom = y;
    columns.forEach((column, columnIndex) => {
      let columnY = top;
      const x = 42 + columnIndex * (width + gap);
      column.forEach((item) => {
        const lines = wrap(`• ${item}`, regular, size, width);
        lines.forEach((line) => { page.drawText(line, { x, y: columnY, size, font: regular, color: graphite }); columnY -= lineHeight; });
        columnY -= 3;
      });
      bottom = Math.min(bottom, columnY);
    });
    y = bottom - 4;
  };
  const reservationConditions = model.company.reservationConditions?.length ? model.company.reservationConditions : defaultConditions(model);
  drawBulletColumns("CONDICIONES DE RESERVA", reservationConditions);
  drawBulletColumns("CONDICIONES OPERACIONALES", model.company.operationalConditions.map((condition) => `${safe(condition.label)}: ${safe(condition.text)}`), 7.5, 9.2);

  finalHeading("FORMA DE PAGO");
  const paymentRows = [model.company.legalName, model.company.taxId ? `RUT ${model.company.taxId}` : "", model.company.bankName, model.company.bankAccountType, model.company.bankAccountNumber ? `N.º ${model.company.bankAccountNumber}` : "", model.company.email].filter(Boolean);
  const paymentTop = y;
  paymentRows.forEach((row, index) => {
    page.drawText(safe(row), { x: index < 3 ? 42 : 309, y: paymentTop - (index % 3) * 11, size: 7.8, font: index === 0 ? bold : regular, color: index === paymentRows.length - 1 ? orange : graphite });
  });
  y = paymentTop - 38;

  page.drawRectangle({ x: 42, y: y - 35, width: 511, height: 45, color: rgb(0.96, 0.965, 0.975), borderColor: rule, borderWidth: 0.6 });
  page.drawText("IMPORTANTE", { x: 54, y: y - 7, size: 7.5, font: bold, color: orange });
  y -= 20;
  drawWrapped(model.company.importantNotice || "La fecha se considera reservada una vez cumplidas las condiciones de confirmación correspondientes.", 54, 487, 7.8, 9.5);
  y -= 13;

  finalHeading("¿LISTOS PARA CREAR LA EXPERIENCIA?");
  drawWrapped("Para continuar con esta propuesta, responde este correo o avanza con el proceso de reserva BOOMBOX.", 42, 511, 8, 10);
  y -= 1;
  drawWrapped("16 años creando experiencias que se recuerdan.", 42, 511, 9, 10, bold);

  const pages = pdf.getPages();
  pages.forEach((current, index) => footer(current, regular, model, index + 1, pages.length));
  return Buffer.from(await pdf.save());
}
