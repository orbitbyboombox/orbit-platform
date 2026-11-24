import type { CollectionBankDetails } from "./collection-bank-details";
import type { ConsolidatedCollectionLine } from "./consolidated-collection";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(`${value.slice(0, 10)}T12:00:00-04:00`)) : "Sin fecha";
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function buildConsolidatedCollectionText(input: { customerName: string; lines: readonly ConsolidatedCollectionLine[]; overdueTotal: number; upcomingTotal: number; oldestOverdueDays: number; oldestTermDays: number | null; bankDetails: CollectionBankDetails }) {
  const overdueLabel = input.oldestOverdueDays > 0
    ? `${input.oldestOverdueDays} DÍAS VENCIDOS DEL ACUERDO A ${input.oldestTermDays ?? "PLAZO CONTRACTUAL"} DÍAS`
    : "No hay obligaciones vencidas en la selección.";
  const eventLines = input.lines.map(({ invoice }) => [
    `${invoice.projectName} · ${date(invoice.eventDate)} · ${invoice.service}`,
    `Factura: ${invoice.invoiceNumber} · Total: ${money(invoice.amount)} · Abonos: ${money(invoice.paidAmount)} · Vencimiento: ${date(invoice.dueDate)} · Saldo: ${money(invoice.outstandingBalance)}`,
  ].join("\n")).join("\n\n");
  const sections = [
    `Hola, ${input.customerName.split(/\s+/)[0] || "hola"}!`,
    "",
    "Te compartimos el detalle consolidado de tus obligaciones pendientes con BOOMBOX.",
    "",
    eventLines,
    "",
    input.overdueTotal > 0 ? `OBLIGACIONES VENCIDAS: ${money(input.overdueTotal)}` : "OBLIGACIONES VENCIDAS: $0",
    input.upcomingTotal > 0 ? `OBLIGACIONES POR VENCER: ${money(input.upcomingTotal)}` : "OBLIGACIONES POR VENCER: $0",
    overdueLabel,
    "",
    `Datos bancarios: Titular ${input.bankDetails.companyLabel} · ${input.bankDetails.bankName} · ${input.bankDetails.accountType} · ${input.bankDetails.accountNumber} · RUT ${input.bankDetails.rut} · ${input.bankDetails.email}`,
    "",
    "Equipo BOOMBOX",
  ];
  return sections.join("\n");
}

export function buildConsolidatedCollectionHtml(input: { customerName: string; lines: readonly ConsolidatedCollectionLine[]; overdueTotal: number; upcomingTotal: number; oldestOverdueDays: number; oldestTermDays: number | null; bankDetails: CollectionBankDetails }, body: string, subject: string) {
  void subject;
  const rows = input.lines.map(({ invoice }) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb"><strong>${esc(invoice.projectName)}</strong><br><span style="color:#6b7280;font-size:13px">${esc(date(invoice.eventDate))} · ${esc(invoice.service)} · Factura ${esc(invoice.invoiceNumber)}</span><br><span>Total ${esc(money(invoice.amount))} · Abonos ${esc(money(invoice.paidAmount))} · Vence ${esc(date(invoice.dueDate))} · <strong>Saldo ${esc(money(invoice.outstandingBalance))}</strong></span></td></tr>`).join("");
  const overdue = input.overdueTotal > 0 ? `<section style="margin:20px 0;padding:18px;border:2px solid #b42318;border-radius:14px;background:#fff5f5;color:#8a1c13"><div style="font-size:22px;font-weight:800">${esc(String(input.oldestOverdueDays))} DÍAS VENCIDOS DEL ACUERDO A ${esc(input.oldestTermDays === null ? "PLAZO CONTRACTUAL" : `${input.oldestTermDays} DÍAS`)}</div><div style="margin-top:5px;font-size:14px">Desde el vencimiento más antiguo incluido · Total vencido ${esc(money(input.overdueTotal))}</div></section>` : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:520px){.shell{padding:10px!important}.card{border-radius:14px!important}.body{padding:22px!important}}</style></head><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#17191f"><main class="shell" style="padding:28px 12px"><section class="card" style="max-width:620px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e3e5e9"><header style="padding:25px 28px;background:#000;border-bottom:4px solid #f68b1f;color:#fff"><strong style="font-size:22px;letter-spacing:.08em">BOOMBOX</strong><div style="margin-top:7px;color:#f6a452;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Cobranza consolidada</div></header><div class="body" style="padding:28px"><p style="font-size:17px">Hola, <strong>${esc(input.customerName)}</strong>!</p><p style="font-size:14px;line-height:1.55">${esc(body).replaceAll("\n", "<br>")}</p>${overdue}<table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows}</tbody></table><section style="margin-top:22px;padding:18px;background:#fff9f2;border:1px solid #f1c99f;border-radius:14px"><strong>Datos bancarios BOOMBOX</strong><p style="margin:8px 0 0;font-size:13px">Titular ${esc(input.bankDetails.companyLabel)} · ${esc(input.bankDetails.bankName)} · ${esc(input.bankDetails.accountType)} · ${esc(input.bankDetails.accountNumber)} · RUT ${esc(input.bankDetails.rut)} · ${esc(input.bankDetails.email)}</p></section></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT<br><a href="https://www.bbox.cl" style="color:#f07f16">www.bbox.cl</a></footer></section></main></body></html>`;
}
