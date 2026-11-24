import type { CollectionBankDetails } from "./collection-bank-details";
import type { ConsolidatedCollectionLine } from "./consolidated-collection";

type ConsolidatedCollectionEmail = {
  customerName: string;
  customerCompany: string | null;
  lines: readonly ConsolidatedCollectionLine[];
  overdueTotal: number;
  upcomingTotal: number;
  totalOutstanding: number;
  oldestOverdueDays: number;
  oldestTermDays: number | null;
  bankDetails: CollectionBankDetails;
};

const money = (value: number) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
}).format(value);

const date = (value: string | null) => {
  if (!value) return "Sin fecha";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Sin fecha";
};

const esc = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const corporateName = (input: ConsolidatedCollectionEmail) =>
  input.customerCompany?.trim() || input.customerName.trim();

const validTermDays = (value: number | null) =>
  Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;

function validatedOldestTermDays(input: ConsolidatedCollectionEmail) {
  const oldestOverdue = input.lines.find(({ overdue }) => overdue);
  return oldestOverdue?.invoice.contractAvailable
    ? validTermDays(input.oldestTermDays)
    : null;
}

function greeting(input: ConsolidatedCollectionEmail) {
  const isCorporate = input.lines.some(({ invoice }) => invoice.customerType === "CORPORATE");
  const name = (isCorporate ? corporateName(input) : input.customerName.trim()).toLocaleUpperCase("es-CL");
  return `${isCorporate ? "ESTIMADOS" : "ESTIMADO/A"} ${name || "CLIENTE"}:`;
}

function overdueLabel(input: ConsolidatedCollectionEmail) {
  const days = Math.max(0, Math.trunc(input.oldestOverdueDays));
  const termDays = validatedOldestTermDays(input);
  if (!days) return "";
  return termDays
    ? `${days} DÍAS VENCIDOS DEL ACUERDO A ${termDays} DÍAS`
    : `${days} DÍAS VENCIDOS`;
}

function bankDetailsText(details: CollectionBankDetails) {
  return [
    ["Titular", details.companyLabel],
    ["Banco", details.bankName],
    ["Tipo de cuenta", details.accountType],
    ["N.º de cuenta", details.accountNumber],
    ["RUT", details.rut],
    ["Email", details.email],
  ].filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function buildConsolidatedCollectionText(input: ConsolidatedCollectionEmail) {
  const overdueLines = input.lines.filter(({ overdue }) => overdue);
  const upcomingLines = input.lines.filter(({ overdue }) => !overdue);
  const eventLines = (lines: readonly ConsolidatedCollectionLine[]) => lines.map(({ invoice }) => [
    invoice.projectName,
    `Vencimiento: ${date(invoice.dueDate)}`,
    `Saldo pendiente: ${money(invoice.outstandingBalance)}`,
    ...(invoice.paidAmount > 0 ? [`Abonos registrados: ${money(invoice.paidAmount)}`] : []),
  ].join("\n")).join("\n\n────────────────────\n\n");

  return [
    greeting(input),
    "",
    "Junto con saludar, les compartimos el detalle consolidado de los pagos pendientes de regularización con BOOMBOX®.",
    ...(overdueLines.length ? ["", overdueLabel(input), "", eventLines(overdueLines), "", `TOTAL VENCIDO A PAGAR: ${money(input.overdueTotal)} CLP`] : []),
    ...(upcomingLines.length ? ["", "POR VENCER", "", eventLines(upcomingLines), "", `TOTAL POR VENCER: ${money(input.upcomingTotal)} CLP`] : []),
    ...(overdueLines.length && upcomingLines.length ? ["", `DEUDA TOTAL SELECCIONADA: ${money(input.totalOutstanding)} CLP`] : []),
    "",
    "Agradecemos regularizar el saldo pendiente a la brevedad y enviarnos el comprobante de transferencia.",
    "",
    "Datos bancarios para transferencia:",
    bankDetailsText(input.bankDetails),
    "",
    "BOOMBOX®",
    "Departamento de Finanzas",
    "www.boom-box.cl",
  ].join("\n");
}

function eventRows(lines: readonly ConsolidatedCollectionLine[]) {
  return lines.map(({ invoice }) => `<tr><td style="padding:15px 0;border-bottom:1px solid #e8e8e8;word-break:break-word"><div style="font-size:15px;line-height:1.4;font-weight:700;color:#17191f">${esc(invoice.projectName)}</div><div style="margin-top:5px;font-size:13px;line-height:1.5;color:#666">Vencimiento: ${esc(date(invoice.dueDate))}</div><div style="margin-top:3px;font-size:14px;line-height:1.5;color:#17191f"><strong>Saldo pendiente: ${esc(money(invoice.outstandingBalance))}</strong></div>${invoice.paidAmount > 0 ? `<div style="margin-top:3px;font-size:12px;line-height:1.45;color:#666">Abonos registrados: ${esc(money(invoice.paidAmount))}</div>` : ""}</td></tr>`).join("");
}

function section(title: string, lines: readonly ConsolidatedCollectionLine[]) {
  if (!lines.length) return "";
  return `<tr><td style="padding:22px 0 4px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.5px;color:#707070;text-transform:uppercase">${title}</td></tr>${eventRows(lines)}`;
}

function bankRows(details: CollectionBankDetails) {
  const rows: Array<[string, string]> = [
    ["Titular", details.companyLabel],
    ["Banco", details.bankName],
    ["Tipo de cuenta", details.accountType],
    ["N.º de cuenta", details.accountNumber],
    ["RUT", details.rut],
    ["Email", details.email],
  ];
  return rows.filter(([, value]) => value.trim()).map(([label, value]) => `<tr><td style="padding:5px 0;font-size:12px;line-height:1.45;color:#717171;vertical-align:top;width:38%">${esc(label)}</td><td style="padding:5px 0;font-size:12px;line-height:1.45;color:#242424;word-break:break-word">${esc(value)}</td></tr>`).join("");
}

export function buildConsolidatedCollectionHtml(input: ConsolidatedCollectionEmail, subject: string) {
  void subject;
  const overdueLines = input.lines.filter(({ overdue }) => overdue);
  const upcomingLines = input.lines.filter(({ overdue }) => !overdue);
  const label = overdueLabel(input);
  const overdueBlock = overdueLines.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse"><tr><td style="padding:16px 17px;background:#fff3f1;border-left:4px solid #c53030;color:#8d1f1f;font-size:18px;line-height:1.35;font-weight:700">${esc(label)}</td></tr></table>`
    : "";
  const totalBlock = overdueLines.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:21px;border-collapse:collapse"><tr><td bgcolor="#111111" style="padding:18px 17px;background:#111111;color:#ffffff"><div style="font-size:11px;line-height:1.4;letter-spacing:1.2px;color:#f28e2b;font-weight:700">TOTAL VENCIDO A PAGAR</div><div style="margin-top:5px;font-size:25px;line-height:1.25;font-weight:700;color:#ffffff">${esc(money(input.overdueTotal))} <span style="font-size:13px;font-weight:400">CLP</span></div></td></tr></table>`
    : "";
  const upcomingTotal = upcomingLines.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;border-collapse:collapse"><tr><td style="padding:13px 15px;background:#fff8ef;border:1px solid #f2d8bd"><div style="font-size:11px;line-height:1.4;letter-spacing:1px;color:#8a562a;font-weight:700">TOTAL POR VENCER</div><div style="margin-top:4px;font-size:18px;line-height:1.3;color:#242424;font-weight:700">${esc(money(input.upcomingTotal))} CLP</div></td></tr></table>`
    : "";
  const combinedTotal = overdueLines.length && upcomingLines.length
    ? `<p style="margin:12px 0 0;text-align:right;font-size:12px;line-height:1.5;color:#6d6d6d">Deuda total seleccionada: <strong style="color:#222">${esc(money(input.totalOutstanding))} CLP</strong></p>`
    : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>@media only screen and (max-width:520px){.email-shell{padding:12px 8px!important}.email-body{padding:23px 19px!important}.email-logo{width:190px!important;height:auto!important}}</style></head><body style="margin:0;padding:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#191919"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f2f2f2"><tr><td class="email-shell" align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:collapse;background:#ffffff"><tr><td align="center" bgcolor="#101113" style="padding:25px 20px 22px;background:#101113;border-bottom:3px solid #f28e2b"><img class="email-logo" src="https://app.bbox.cl/branding/boombox-logo-official-white-email.png" width="220" height="50" alt="BOOMBOX®" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto"><div style="margin-top:11px;color:#f28e2b;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.7px">DEPARTAMENTO DE FINANZAS</div></td></tr><tr><td class="email-body" style="padding:29px 32px 28px"><p style="margin:0 0 15px;font-size:16px;line-height:1.45;font-weight:700;color:#17191f">${esc(greeting(input))}</p><p style="margin:0;font-size:14px;line-height:1.7;color:#454545">Junto con saludar, les compartimos el detalle consolidado de los pagos pendientes de regularización con BOOMBOX®.</p>${overdueBlock}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:7px;border-collapse:collapse;table-layout:fixed"><tbody>${section("Eventos vencidos", overdueLines)}${section("Eventos por vencer", upcomingLines)}</tbody></table>${totalBlock}${upcomingTotal}${combinedTotal}<p style="margin:23px 0 18px;font-size:14px;line-height:1.65;color:#454545">Agradecemos regularizar el saldo pendiente a la brevedad y enviarnos el comprobante de transferencia.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fafafa;border:1px solid #e8e8e8"><tr><td style="padding:15px 15px 12px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.1px;color:#222">DATOS BANCARIOS PARA TRANSFERENCIA</td></tr>${bankRows(input.bankDetails)}<tr><td colspan="2" style="height:8px;font-size:1px;line-height:1px">&nbsp;</td></tr></table></td></tr><tr><td style="padding:17px 25px 20px;border-top:1px solid #ededed;text-align:center"><div style="font-size:14px;line-height:1.5;font-weight:700;color:#202020">BOOMBOX®</div><div style="font-size:12px;line-height:1.5;color:#686868">Departamento de Finanzas</div><a href="https://www.boom-box.cl" style="font-size:12px;line-height:1.5;color:#e77e1b;text-decoration:none">www.boom-box.cl</a></td></tr></table></td></tr></table></body></html>`;
}
