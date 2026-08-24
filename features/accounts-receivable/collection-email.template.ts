import type { ReceivableInvoice } from "./types";
import type { CollectionBankDetails } from "./collection-bank-details";

export type CollectionEmailTemplateKey = "UPCOMING" | "OVERDUE";

export type CollectionEmailDraft = {
  templateKey: CollectionEmailTemplateKey;
  to: string;
  subject: string;
  body: string;
  statusLabel: string;
  dueDateLabel: string;
  outstandingLabel: string;
  lastNoticeLabel: string;
  bankDetails: CollectionBankDetails;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
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
  invoice: Pick<
    ReceivableInvoice,
    | "invoiceNumber"
    | "customerName"
    | "customerEmail"
    | "projectName"
    | "outstandingBalance"
    | "dueDate"
    | "daysRemaining"
    | "status"
    | "collectionActions"
  >,
  bankDetails: CollectionBankDetails,
): CollectionEmailDraft {
  const overdue =
    invoice.status === "OVERDUE" || (invoice.daysRemaining ?? 0) < 0;
  const templateKey: CollectionEmailTemplateKey = overdue
    ? "OVERDUE"
    : "UPCOMING";
  const outstandingLabel = money(invoice.outstandingBalance);
  const dueDateLabel = date(invoice.dueDate);
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
  const body =
    templateKey === "OVERDUE"
      ? [
          `Hola ${invoice.customerName},`,
          "",
          `Queríamos recordarte que se encuentra vencido un saldo pendiente de ${outstandingLabel} correspondiente a ${invoice.projectName}${invoice.dueDate ? `, cuyo vencimiento era el ${dueDateLabel}` : ""}.`,
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
          `Te escribimos desde BOOMBOX para comentarte que actualmente existe un saldo pendiente de ${outstandingLabel} correspondiente a ${invoice.projectName}${invoice.dueDate ? `, con fecha de pago ${dueDateLabel}` : ""}.`,
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
    subject,
    body,
    statusLabel: emailStatus(invoice),
    dueDateLabel,
    outstandingLabel,
    lastNoticeLabel,
    bankDetails,
  };
}
