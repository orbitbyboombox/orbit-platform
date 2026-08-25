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
  const overdue = draft.templateKey === "OVERDUE";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
  const greeting = paragraphs.shift() ?? "Hola,";
  const closingStart = paragraphs.findIndex((value) =>
    /^Saludos,?/i.test(value),
  );
  const closing = closingStart >= 0 ? paragraphs.splice(closingStart) : [];
  const generatedLine = /^(Detalle de tu evento:|Fecha del evento:|Lugar:|Servicio:|Duración:|Valor total:|Saldo pendiente:|Fecha de pago:|BOOMBOX|Banco:|Tipo de cuenta:|N° de cuenta:|RUT:|Email de transferencia:)/i;
  const message = paragraphs.flatMap((value) => {
    const cleaned = value
      .split("\n")
      .filter((line) => !generatedLine.test(line.trim()))
      .join("\n")
      .trim();
    return cleaned ? [cleaned] : [];
  });
  const row = (label: string, value: string) =>
    `<div style="min-width:0;padding:10px 0;border-bottom:1px solid #eceef2"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:4px;font-size:15px;font-weight:600;color:#17191f;overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`;
  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#343841;overflow-wrap:anywhere">${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(draft.subject)}</div><main style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff;box-shadow:0 16px 42px rgba(17,24,39,.08)"><header style="background:#101216;padding:25px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:7px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Cobranza comercial</div></header><div style="padding:28px"><p style="margin:0 0 16px;font-size:18px;font-weight:700;line-height:1.45;color:#17191f">${escapeHtml(greeting)}</p>${message.slice(0, 2).map(paragraph).join("")}<section style="margin:26px 0;border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#fafafa"><h2 style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;color:#f07f16;text-transform:uppercase">Detalle del evento</h2>${row("Fecha", draft.eventDateLabel)}${draft.eventLocation ? row("Lugar", draft.eventLocation) : ""}${row("Servicio", draft.serviceLabel)}${row("Duración", draft.durationLabel)}</section><section style="margin:26px 0;border:2px solid ${overdue ? "#c94747" : "#f68b1f"};border-radius:16px;padding:22px;background:${overdue ? "#fff7f7" : "#fff9f2"}"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:${overdue ? "#9f2f2f" : "#b85d08"};text-transform:uppercase">${overdue ? "Saldo vencido pendiente" : "Saldo pendiente"}</div><div style="margin-top:8px;font-size:32px;font-weight:800;line-height:1.1;color:#17191f;overflow-wrap:anywhere">${escapeHtml(draft.outstandingLabel)}</div><div style="margin-top:12px;font-size:13px;font-weight:600;color:#4b5563">Fecha de pago / vencimiento: ${escapeHtml(draft.dueDateLabel)}</div></section>${message.slice(2).map(paragraph).join("")}<section style="margin:26px 0 20px;border-radius:16px;padding:20px;background:#101216;color:#ffffff"><h2 style="margin:0 0 10px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Datos para transferencia</h2>${[["Banco",draft.bankDetails.bankName],["Tipo de cuenta",draft.bankDetails.accountType],["N° de cuenta",draft.bankDetails.accountNumber],["RUT",draft.bankDetails.rut],["Email",draft.bankDetails.email]].map(([label,value])=>`<div style="padding:8px 0;border-bottom:1px solid #2b3038"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#aeb4bf;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:3px;font-size:14px;font-weight:600;color:#ffffff;overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`).join("")}</section>${closing.map(paragraph).join("") || '<p style="margin:0;font-size:15px;line-height:1.6;color:#343841">Saludos,<br><strong>Equipo BOOMBOX</strong></p>'}</div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.5;color:#7a808b">Mensaje de seguimiento de pago enviado por BOOMBOX. Si ya realizaste la transferencia, puedes responder con el comprobante.</footer></section></main></body></html>`;
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
  const bankBlock = [
    "",
    "BOOMBOX",
    `Banco: ${bankDetails.bankName}`,
    `Tipo de cuenta: ${bankDetails.accountType}`,
    `N° de cuenta: ${bankDetails.accountNumber}`,
    `RUT: ${bankDetails.rut}`,
    `Email de transferencia: ${bankDetails.email}`,
  ];
  const eventBlock = [
    "Detalle de tu evento:",
    `Fecha del evento: ${eventDateLabel}`,
    ...(invoice.eventLocation
      ? [`Lugar: ${invoice.eventLocation}`]
      : []),
    `Servicio: ${invoice.service ?? "Sin servicio"}`,
    `Duración: ${invoice.eventDuration ?? "Por confirmar"}`,
    `Valor total: ${totalLabel}`,
    `Saldo pendiente: ${outstandingLabel}`,
    ...(invoice.dueDate ? [`Fecha de pago: ${dueDateLabel}`] : []),
  ];
  const body =
    templateKey === "OVERDUE"
      ? [
          `Hola ${invoice.customerName},`,
          "",
          "Queríamos recordarte que el saldo pendiente de tu evento se encuentra vencido.",
          "",
          ...eventBlock,
          "",
          "Para regularizar el pago, puedes realizar la transferencia a los siguientes datos:",
          ...bankBlock,
          "",
          "Una vez realizado el pago, agradeceremos enviarnos el comprobante para actualizar nuestros registros.",
          "",
          "Si ya efectuaste la transferencia, puedes omitir este mensaje.",
          "",
          "Muchas gracias.",
          "",
          "Saludos,",
          "Equipo BOOMBOX",
        ].join("\n")
      : [
          `Hola ${invoice.customerName},`,
          "",
          "Te escribimos desde BOOMBOX para recordarte el saldo pendiente de tu evento.",
          "",
          ...eventBlock,
          "",
          "Para regularizar el pago, te dejamos nuevamente nuestros datos bancarios:",
          ...bankBlock,
          "",
          "Una vez realizado el pago, puedes responder este correo adjuntando el comprobante para que podamos actualizar nuestros registros.",
          "",
          "Si el pago ya fue efectuado, por favor puedes omitir este mensaje.",
          "",
          "Muchas gracias.",
          "",
          "Saludos,",
          "Equipo BOOMBOX",
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
