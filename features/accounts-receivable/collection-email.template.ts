import type { ReceivableInvoice } from "./types";
import type { CollectionBankDetails } from "./collection-bank-details";

export type CollectionEmailTemplateKey = "UPCOMING" | "OVERDUE";

export type CollectionEmailDraft = {
  templateKey: CollectionEmailTemplateKey;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  statusLabel: string;
  dueDateLabel: string;
  eventDateLabel: string;
  eventLocation: string | null;
  serviceLabel: string;
  durationLabel: string;
  totalLabel: string;
  outstandingLabel: string;
  lastNoticeLabel: string;
  bankDetails: CollectionBankDetails;
};

type CollectionEmailInvoiceInput = Pick<
  ReceivableInvoice,
  | "invoiceNumber"
  | "customerName"
  | "customerEmail"
  | "customerSecondaryEmail"
  | "projectName"
  | "outstandingBalance"
  | "dueDate"
  | "daysRemaining"
  | "status"
  | "collectionActions"
> &
  Partial<
    Pick<
      ReceivableInvoice,
      "amount" | "eventDate" | "eventLocation" | "service" | "eventDuration"
    >
  >;

export function collectionDraftFingerprint(draft: CollectionEmailDraft) {
  return JSON.stringify([
    draft.templateKey,
    draft.to,
    draft.eventDateLabel,
    draft.eventLocation,
    draft.serviceLabel,
    draft.durationLabel,
    draft.totalLabel,
    draft.outstandingLabel,
    draft.dueDateLabel,
  ]);
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function buildCollectionEmailHtml(
  draft: CollectionEmailDraft,
  body = draft.body,
) {
  const firstParagraph = body
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .find(Boolean);
  const greetingLine = firstParagraph?.split("\n")[0]?.trim() ?? "Hola,";
  const greeting = /^Hola(?:\s|,)/i.test(greetingLine) ? greetingLine : "Hola,";
  const detailCell = (label: string, value: string, dark = false) =>
    `<div style="display:inline-block;vertical-align:top;box-sizing:border-box;width:49%;min-width:230px;padding:10px 12px 10px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:${dark ? "#aeb4bf" : "#6b7280"};text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:5px;font-size:15px;font-weight:600;color:${dark ? "#ffffff" : "#17191f"};overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`;
  const eventDetails = [
    ["Fecha", draft.eventDateLabel],
    ...(draft.eventLocation ? [["Lugar", draft.eventLocation]] : []),
    ["Servicio", draft.serviceLabel],
    ["Duración", draft.durationLabel],
  ].map(([label, value]) => detailCell(label, value)).join("");
  const bankDetails = [
    ["Banco", draft.bankDetails.bankName],
    ["Tipo de cuenta", draft.bankDetails.accountType],
    ["N° de cuenta", draft.bankDetails.accountNumber],
    ["RUT", draft.bankDetails.rut],
    ["Email", draft.bankDetails.email],
  ].map(([label, value]) => detailCell(label, value, true)).join("");

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(draft.subject)}</div><main style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff;box-shadow:0 16px 42px rgba(17,24,39,.08)"><header style="background:#101216;padding:25px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:7px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Cobranza comercial</div></header><div style="padding:28px"><p style="margin:0 0 8px;font-size:18px;font-weight:700;line-height:1.45;color:#17191f">${escapeHtml(greeting)}</p><p style="margin:0;font-size:15px;font-weight:400;line-height:1.65;color:#5f6470">Te escribimos para recordarte el saldo pendiente de tu evento.</p><section style="margin:26px 0;border:1px solid #30343a;border-radius:16px;padding:18px 20px;background:#fafafa"><h2 style="margin:0 0 8px;font-size:11px;letter-spacing:.16em;color:#f07f16;text-transform:uppercase">Detalle del evento</h2><div style="font-size:0">${eventDetails}</div></section><section style="margin:26px 0;border:2px solid #30343a;border-radius:16px;padding:22px 24px;background:#fff9f0"><div style="font-size:11px;font-weight:800;letter-spacing:.16em;color:#bf4a00;text-transform:uppercase">Saldo pendiente</div><div style="margin-top:10px;font-size:36px;font-weight:800;line-height:1.1;color:#090a0c;overflow-wrap:anywhere">${escapeHtml(draft.outstandingLabel)}</div><div style="margin-top:14px;font-size:13px;font-weight:600;color:#5f6470">Fecha de pago / vencimiento: ${escapeHtml(draft.dueDateLabel)}</div></section><section style="margin:26px 0 0;border-radius:16px;padding:20px 22px;background:#090a0c;color:#ffffff"><h2 style="margin:0 0 8px;font-size:11px;letter-spacing:.16em;color:#f6a452;text-transform:uppercase">Datos para transferencia</h2><div style="font-size:0">${bankDetails}</div></section><p style="margin:18px 0 0;font-size:12px;font-weight:400;line-height:1.6;color:#6b7280">Una vez realizado el pago, envía el comprobante a <a href="mailto:contabilidad@bbox.cl" style="color:#bf4a00;text-decoration:underline">contabilidad@bbox.cl</a>.</p></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.6;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="https://www.bbox.cl" style="color:#f07f16;text-decoration:none">www.bbox.cl</a></footer></section></main></body></html>`;
}

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const date = (value: string | null, dateStyle: "medium" | "long" = "medium") =>
  value
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle,
        timeZone: "America/Santiago",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00-04:00`))
    : "Sin fecha";

const emailStatus = (invoice: Pick<ReceivableInvoice, "status" | "daysRemaining">) => {
  if (invoice.status === "PAID") return "Pagado";
  if (invoice.status === "CANCELLED") return "Cancelado";
  if (invoice.status === "OVERDUE" || (invoice.daysRemaining ?? 0) < 0)
    return "Vencido";
  if (invoice.status === "PARTIALLY_PAID") return "Parcial";
  if ((invoice.daysRemaining ?? 0) === 0) return "Vence hoy";
  return "Pendiente";
};

export function getLastCollectionNoticeAt(
  actions: readonly { type: string; occurredAt: string }[],
): string | null {
  return (
    actions.find(
      (item) =>
        item.type === "PAYMENT_REMINDER" ||
        item.type === "COLLECTION_EMAIL" ||
        item.type.startsWith("COLLECTION_"),
    )?.occurredAt ?? null
  );
}

export function buildCollectionEmailDraft(
  invoice: CollectionEmailInvoiceInput,
  bankDetails: CollectionBankDetails,
): CollectionEmailDraft {
  const overdue =
    invoice.status === "OVERDUE" || (invoice.daysRemaining ?? 0) < 0;
  const templateKey: CollectionEmailTemplateKey = overdue
    ? "OVERDUE"
    : "UPCOMING";
  const outstandingLabel = money(invoice.outstandingBalance);
  const totalLabel = money(invoice.amount ?? invoice.outstandingBalance);
  const dueDateLabel = date(invoice.dueDate, "long");
  const eventDateLabel = invoice.eventDate
    ? date(invoice.eventDate, "long")
    : "Por confirmar";
  const lastNoticeAt = getLastCollectionNoticeAt(invoice.collectionActions);
  const lastNoticeLabel = lastNoticeAt
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santiago",
      }).format(new Date(lastNoticeAt))
    : "Sin avisos previos";
  const subject =
    templateKey === "OVERDUE"
      ? `Saldo vencido pendiente de regularización — BOOMBOX`
      : `Recordatorio de saldo pendiente — BOOMBOX`;
  const eventBlock = [
    "DETALLE DEL EVENTO",
    `FECHA\n${eventDateLabel}`,
    ...(invoice.eventLocation
      ? [`LUGAR\n${invoice.eventLocation}`]
      : []),
    `SERVICIO\n${invoice.service ?? "Sin servicio"}`,
    `DURACIÓN\n${invoice.eventDuration ?? "Por confirmar"}`,
  ];
  const body = [
    `Hola ${invoice.customerName},`,
    "",
    "Te escribimos para recordarte el saldo pendiente de tu evento.",
    "",
    ...eventBlock,
    "",
    "SALDO PENDIENTE",
    outstandingLabel,
    `Fecha de pago / vencimiento: ${dueDateLabel}`,
    "",
    "DATOS PARA TRANSFERENCIA",
    `BANCO\n${bankDetails.bankName}`,
    `TIPO DE CUENTA\n${bankDetails.accountType}`,
    `N° DE CUENTA\n${bankDetails.accountNumber}`,
    `RUT\n${bankDetails.rut}`,
    `EMAIL DE TRANSFERENCIA\n${bankDetails.email}`,
    "",
    "Una vez realizado el pago, envía el comprobante a contabilidad@bbox.cl.",
  ].join("\n");

  return {
    templateKey,
    to: invoice.customerEmail ?? "",
    cc: invoice.customerSecondaryEmail ? [invoice.customerSecondaryEmail] : [],
    subject,
    body,
    statusLabel: emailStatus(invoice),
    dueDateLabel,
    eventDateLabel,
    eventLocation: invoice.eventLocation ?? null,
    serviceLabel: invoice.service ?? "Sin servicio",
    durationLabel: invoice.eventDuration ?? "Por confirmar",
    totalLabel,
    outstandingLabel,
    lastNoticeLabel,
    bankDetails,
  };
}
