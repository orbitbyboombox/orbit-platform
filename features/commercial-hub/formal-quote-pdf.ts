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
  const ensure = (height: number) => {
    if (y - height < 56) nextPage();
  };
  const heading = (text: string, keepWithNext = 12) => {
    ensure(18 + keepWithNext);
    page.drawText(text, { x: 42, y, size: 8.5, font: bold, color: orange });
    y -= 17;
  };
  const paragraph = (
    text: string,
    options: {
      size?: number;
      bold?: boolean;
      indent?: number;
      lineHeight?: number;
      after?: number;
    } = {},
  ) => {
    const size = options.size ?? 8.5;
    const font = options.bold ? bold : regular;
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? 11;
    const lines = wrap(text, font, size, 511 - indent);
    ensure(lines.length * lineHeight + (options.after ?? 1));
    lines.forEach((item) => {
      page.drawText(item, { x: 42 + indent, y, size, font, color: graphite });
      y -= lineHeight;
    });
    y -= options.after ?? 1;
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
  customerRows.forEach((item, index) =>
    paragraph(item, {
      bold: index === 0,
      size: index === 0 ? 10 : 8,
      lineHeight: index === 0 ? 12 : 9,
      after: 0,
    }),
  );
  y -= 13;

  const tableHeader = () => {
    ensure(34);
    page.drawRectangle({
      x: 42,
      y: y - 5,
      width: 511,
      height: 24,
      color: graphite,
    });
    page.drawText("DESCRIPCIÓN", {
      x: 52,
      y: y + 2,
      size: 8,
      font: bold,
      color: white,
    });
    rightText(page, "CANT.", 382, y + 2, 8, bold, white);
    rightText(page, "P. UNITARIO", 462, y + 2, 8, bold, white);
    rightText(page, "TOTAL", 543, y + 2, 8, bold, white);
    y -= 30;
  };
  tableHeader();
  for (const item of model.lines) {
    const descriptions = wrap(item.description, regular, 8.5, 265);
    const rowHeight = Math.max(22, descriptions.length * 10 + 6);
    if (y - rowHeight < 56) {
      nextPage();
      tableHeader();
    }
    descriptions.forEach((text, index) =>
      page.drawText(text, {
        x: 52,
          y: y - index * 10,
        size: 8.2,
        font: regular,
        color: graphite,
      }),
    );
    rightText(page, String(item.quantity), 376, y, 8.5, regular);
    rightText(page, money(item.quotedPrice), 462, y, 7.5, regular);
    rightText(page, money(item.total), 543, y, 7.5, bold);
    y -= rowHeight;
    page.drawLine({
      start: { x: 42, y: y + 6 },
      end: { x: 553, y: y + 6 },
      thickness: 0.4,
      color: rule,
    });
  }

  ensure(132);
  y -= 5;
  const totals: Array<[string, number, boolean?]> = [
    ["Subtotal", model.subtotal],
    ...(model.discount
      ? [["Descuento", -model.discount] as [string, number]]
      : []),
    ["Neto", model.net],
    ["IVA 19%", model.tax],
    ["TOTAL PROPUESTA", model.total, true],
  ];
  totals.forEach(([label, value, strong]) => {
    page.drawText(label, {
      x: 342,
      y,
      size: strong ? 11 : 8.5,
      font: strong ? bold : regular,
      color: strong ? graphite : muted,
    });
    rightText(
      page,
      money(value),
      553,
      y,
      strong ? 15 : 9,
      bold,
      strong ? orange : graphite,
    );
    y -= strong ? 24 : 16;
  });
  page.drawLine({
    start: { x: 342, y: y + 8 },
    end: { x: 553, y: y + 8 },
    thickness: 1,
    color: orange,
  });
  [
    ["ABONO PARA RESERVAR", model.deposit],
    ["SALDO", model.balance],
  ].forEach(([label, value]) => {
    page.drawText(String(label), {
      x: 342,
      y,
      size: 9,
      font: bold,
      color: graphite,
    });
    rightText(page, money(Number(value)), 553, y, 10, bold);
    y -= 18;
  });
  y -= 5;

  const conditions = model.company.reservationConditions?.length
    ? model.company.reservationConditions
    : defaultConditions(model);
  const drawCompactColumns = (title: string, items: string[]) => {
    const columnWidth = 246;
    const gap = 19;
    const split = Math.ceil(items.length / 2);
    const columns = [items.slice(0, split), items.slice(split)];
    const itemHeight = (item: string) =>
      wrap(`• ${item}`, regular, 7, columnWidth).length * 8.6 + 2;
    const columnHeights = columns.map((column) =>
      column.reduce((sum, item) => sum + itemHeight(item), 0),
    );
    const blockHeight = Math.max(...columnHeights, 0);
    ensure(17 + blockHeight + 4);
    heading(title, blockHeight);
    const topY = y;
    columns.forEach((column, columnIndex) => {
      let columnY = topY;
      const x = 42 + columnIndex * (columnWidth + gap);
      for (const item of column) {
        const lines = wrap(`• ${item}`, regular, 7, columnWidth);
        lines.forEach((line) => {
          page.drawText(line, {
            x,
            y: columnY,
            size: 7,
            font: regular,
            color: graphite,
          });
          columnY -= 8.6;
        });
        columnY -= 2;
      }
    });
    y = topY - blockHeight - 4;
  };
  drawCompactColumns("CONDICIONES DE RESERVA", conditions);

  const conditionLines = (
    condition: QuoteOperationalCondition,
    width: number,
    size: number,
  ) => {
    const label = `${safe(condition.label)}:`;
    const words = safe(condition.text).split(/\s+/).filter(Boolean);
    const firstWidth = Math.max(
      30,
      width - bold.widthOfTextAtSize(label, size) - 3,
    );
    let first = "";
    while (words.length) {
      const candidate = first ? `${first} ${words[0]}` : words[0];
      if (regular.widthOfTextAtSize(candidate, size) > firstWidth && first)
        break;
      first = candidate;
      words.shift();
    }
    return {
      label,
      lines: [first, ...wrap(words.join(" "), regular, size, width)].filter(
        Boolean,
      ),
    };
  };
  const operational = model.company.operationalConditions;
  const operationalWidth = 246;
  const operationalGap = 19;
  const operationalSize = 7;
  const operationalLineHeight = 8.2;
  const operationalSplit = Math.ceil(operational.length / 2);
  const operationalColumns = [
    operational.slice(0, operationalSplit),
    operational.slice(operationalSplit),
  ];
  const operationalHeight = (column: QuoteOperationalCondition[]) =>
    column.reduce(
      (sum, condition) =>
        sum +
        conditionLines(condition, operationalWidth, operationalSize).lines
          .length *
          operationalLineHeight +
        2,
      0,
    );
  const operationalBlockHeight = Math.max(
    ...operationalColumns.map(operationalHeight),
    0,
  );
  if (operationalBlockHeight + 21 <= 626) {
    ensure(17 + operationalBlockHeight + 4);
    heading("CONDICIONES OPERACIONALES", operationalBlockHeight);
    const topY = y;
    operationalColumns.forEach((column, columnIndex) => {
      let columnY = topY;
      const x = 42 + columnIndex * (operationalWidth + operationalGap);
      for (const condition of column) {
        const lines = conditionLines(
          condition,
          operationalWidth,
          operationalSize,
        );
        const labelWidth = bold.widthOfTextAtSize(lines.label, operationalSize);
        page.drawText(lines.label, {
          x,
          y: columnY,
          size: operationalSize,
          font: bold,
          color: graphite,
        });
        page.drawText(lines.lines[0], {
          x: x + labelWidth + 3,
          y: columnY,
          size: operationalSize,
          font: regular,
          color: graphite,
        });
        lines.lines.slice(1).forEach((line, index) =>
          page.drawText(line, {
            x,
            y: columnY - (index + 1) * operationalLineHeight,
            size: operationalSize,
            font: regular,
            color: graphite,
          }),
        );
        columnY -= lines.lines.length * operationalLineHeight + 2;
      }
    });
    y = topY - operationalBlockHeight - 4;
  } else {
    heading("CONDICIONES OPERACIONALES", 18);
    for (const condition of operational) {
      const lines = conditionLines(condition, 511, 7.2);
      ensure(lines.lines.length * 9 + 4);
      const labelWidth = bold.widthOfTextAtSize(lines.label, 7.2);
      page.drawText(lines.label, {
        x: 42,
        y,
        size: 7.2,
        font: bold,
        color: graphite,
      });
      page.drawText(lines.lines[0], {
        x: 45 + labelWidth,
        y,
        size: 7.2,
        font: regular,
        color: graphite,
      });
      y -= 9;
      lines.lines.slice(1).forEach((line) => {
        page.drawText(line, {
          x: 42,
          y,
          size: 7.2,
          font: regular,
          color: graphite,
        });
        y -= 9;
      });
      y -= 3;
    }
  }

  // Payment and commercial closing form one final unit; never orphan the CTA.
  ensure(112);
  heading("FORMA DE PAGO", 38);
  const bankRows = [
    model.company.legalName,
    model.company.taxId ? `RUT ${model.company.taxId}` : "",
    model.company.bankName,
    model.company.bankAccountType,
    model.company.bankAccountNumber
      ? `N.º ${model.company.bankAccountNumber}`
      : "",
    model.company.email,
  ].filter(Boolean);
  const bankLineOne = bankRows.slice(0, 2).join(" · ");
  const bankLineTwo = bankRows.slice(2, 5).join(" · ");
  paragraph(bankLineOne, { size: 7.5, bold: true, lineHeight: 9, after: 1 });
  paragraph(bankLineTwo, { size: 7.5, lineHeight: 9, after: 1 });
  if (bankRows[5])
    paragraph(bankRows[5], { size: 7.5, lineHeight: 9, after: 2 });

  ensure(49);
  heading("¿LISTOS PARA CREAR LA EXPERIENCIA?", 28);
  paragraph(
    "Para continuar con esta propuesta, responde este correo o avanza con el proceso de reserva BOOMBOX.",
    { size: 8, lineHeight: 10, after: 2 },
  );
  paragraph("16 años creando experiencias que se recuerdan.", {
    size: 9,
    bold: true,
    lineHeight: 10,
    after: 0,
  });
  return Buffer.from(await pdf.save());
}
