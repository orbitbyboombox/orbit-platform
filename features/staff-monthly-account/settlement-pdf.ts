import {formatDisplayDate} from "../../lib/display-date.ts";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";
import type { StaffMonthlyAccount } from "./model.ts";
type Input = {
  account: StaffMonthlyAccount;
  staff: { name: string; rut: string; role: string };
  periodTitle?: string;
  firstQuincena?: boolean;
};
const PAGE: [number, number] = [595.28, 841.89];
const orange = rgb(0.96, 0.49, 0.05),
  black = rgb(0.045, 0.05, 0.06),
  muted = rgb(0.38, 0.4, 0.44),
  line = rgb(0.88, 0.89, 0.91);
const money = (value: number) =>
  `$${Math.round(value).toLocaleString("es-CL")}`;
const staffMonthLabel = (month: string) =>
  new Date(`${month.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
const safe = (value: string) =>
  value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
function wrapped(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of safe(text).split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}
function base(
  pdf: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  title: string,
  quincenal: boolean,
) {
  const page = pdf.addPage(PAGE);
  page.drawRectangle({
    x: 0,
    y: PAGE[1] - 112,
    width: PAGE[0],
    height: 112,
    color: black,
  });
  page.drawText("BOOMBOX", {
    x: 42,
    y: PAGE[1] - 52,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    quincenal ? "ORBIT · LIQUIDACIÓN QUINCENAL" : "ORBIT · LIQUIDACIÓN MENSUAL",
    { x: 42, y: PAGE[1] - 78, size: 10, font: bold, color: orange },
  );
  page.drawText(safe(title).toUpperCase(), {
    x: 42,
    y: PAGE[1] - 96,
    size: 8,
    font: regular,
    color: rgb(0.78, 0.8, 0.83),
  });
  page.drawText("Documento emitido por BOOMBOX mediante ORBIT.", {
    x: 42,
    y: 28,
    size: 8,
    font: regular,
    color: muted,
  });
  return page;
}
export async function createStaffMonthlySettlementPdf({
  account,
  staff,
  periodTitle,
  firstQuincena = false,
}: Input) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const period = periodTitle ?? staffMonthLabel(account.month);
  let page = base(pdf, regular, bold, period, firstQuincena),
    y = PAGE[1] - 150;
  const text = (
    value: string,
    x: number,
    top: number,
    font = regular,
    size = 9,
    color = black,
  ) => page.drawText(safe(value), { x, y: top, font, size, color });
  text("TRABAJADOR", 42, y, bold, 8, muted);
  text(staff.name, 42, y - 17, bold, 11);
  text(`RUT ${staff.rut || "No informado"}`, 42, y - 35);
  text(staff.role || "Staff BOOMBOX", 340, y - 35);
  y -= 70;
  text("DETALLE DE SERVICIOS REALIZADOS", 42, y, bold, 10, orange);
  y -= 25;
  for (const detail of account.calculation.details) {
    const eventLines = wrapped(detail.event || detail.service, bold, 9, 350);
    const infoLines = wrapped(
      `${detail.service} · ${detail.roles.join(" + ")} · ${detail.hours} horas`,
      regular,
      8,
      430,
    );
    const locationLines = wrapped(
      `${detail.location || "Lugar no informado"}${detail.advances > 0 ? ` · Adelanto ${money(detail.advances)}` : ""}`,
      regular,
      8,
      430,
    );
    const height =
      20 + (eventLines.length + infoLines.length + locationLines.length) * 12;
    if (y - height < 65) {
      page = base(pdf, regular, bold, period, firstQuincena);
      y = PAGE[1] - 150;
    }
    page.drawLine({
      start: { x: 42, y: y + 8 },
      end: { x: 553, y: y + 8 },
      thickness: 0.6,
      color: line,
    });
    text(
      formatDisplayDate(detail.eventDate),
      42,
      y - 8,
      bold,
      9,
    );
    text(money(detail.workNet), 475, y - 8, bold, 9);
    for (const value of eventLines) {
      text(value, 112, y - 8, bold, 9);
      y -= 12;
    }
    for (const value of [...infoLines, ...locationLines]) {
      text(value, 112, y - 8, regular, 8, muted);
      y -= 12;
    }
    y -= 20;
  }
  // Keep the complete financial summary and its tax reference together.
  if (y < 480) {
    page = base(pdf, regular, bold, period, firstQuincena);
    y = PAGE[1] - 150;
  }
  text(
    periodTitle ? "RESUMEN DEL BLOQUE" : "RESUMEN DEL MES",
    42,
    y,
    bold,
    10,
    orange,
  );
  y -= 26;
  const rows: [string, string][] = [
    ["N° de servicios", String(account.eventCount)],
    ["Total trabajado", money(account.workNet)],
    [
      `Retención / impuesto (${account.withholdingRate.toLocaleString("es-CL")}%)`,
      money(account.withholdingAmount),
    ],
    ["Líquido según boleta", money(account.boletaNet)],
    ["Adelantos realizados", `-${money(account.advancesTotal)}`],
    ["Reembolsos aprobados", money(account.reimbursementsTotal)],
    ["Reembolsos pagados", money(account.reimbursementsPaidTotal)],
    ["Reembolsos pendientes", money(account.reimbursementsPendingTotal)],
    ["Saldo honorarios a transferir", money(account.finalTransferAmount)],
  ];
  for (const [label, value] of rows) {
    page.drawLine({
      start: { x: 42, y: y + 8 },
      end: { x: 553, y: y + 8 },
      thickness: 0.5,
      color: line,
    });
    text(label, 48, y - 10);
    text(value, 425, y - 10, bold, 10);
    y -= 32;
  }
  y -= 6;
  page.drawRectangle({
    x: 42,
    y: y - 92,
    width: 511,
    height: 98,
    color: rgb(1, 0.965, 0.92),
    borderColor: orange,
    borderWidth: 2,
  });
  text(
    firstQuincena
      ? "REFERENCIA BRUTA DE HONORARIOS DEL BLOQUE"
      : "MONTO TOTAL BOLETA SII A EMITIR",
    62,
    y - 20,
    bold,
    10,
    orange,
  );
  text(money(account.boletaGross), 62, y - 58, bold, 26);
  text(
    firstQuincena
      ? "La boleta mensual se consolida al cerrar ambas quincenas."
      : "Este es el monto exacto que debes ingresar en SII.",
    62,
    y - 78,
    bold,
    9,
    muted,
  );
  return Buffer.from(await pdf.save());
}
