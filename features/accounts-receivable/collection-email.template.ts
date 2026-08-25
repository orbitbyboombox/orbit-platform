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
