import {
  canonicalEventDuration,
  commercialServiceList,
  currentCustomerContact,
} from "../../../projects/reservation-presentation.ts";
import { renderBoomboxCommercialEmail } from "./boombox-commercial-email.html.ts";

const currency = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
const eventDate = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));

export function founderPaymentStatusLabel(input: {
  total: number;
  paid: number;
  balance: number;
}) {
  if (input.total > 0 && input.balance <= 0) return "Pagado";
  if (input.paid > 0) return "Pago parcial";
  return "Pago pendiente";
}

export type FounderReservationNotificationInput = {
  projectId: string;
  projectUrl: string;
  orbitEventId?: string | null;
  quotationNumber?: string | null;
  customer: { fullName?: string | null; metadata?: unknown };
  serviceCodes: string[];
  serviceDurations: Array<number | null | undefined>;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  eventDurationHours?: number | null;
  eventDate: string;
  amount: number;
  paid: number;
  balance: number;
  customerType: string;
  contractStatus: "SIGNED" | "PENDING";
  integrations: Array<{ label: string; ready: boolean }>;
  website: string;
};

export function renderFounderReservationNotification(
  input: FounderReservationNotificationInput,
) {
  const contract =
    input.contractStatus === "SIGNED"
      ? "Firmado"
      : "Pendiente";
  const rows = [
    ["Cliente", currentCustomerContact(input.customer)],
    ["Número de reserva", input.quotationNumber ?? input.orbitEventId ?? "—"],
    ["Servicio", commercialServiceList(input.serviceCodes)],
    [
      "Duración",
      canonicalEventDuration({
        serviceStartAt: input.serviceStartAt,
        serviceEndAt: input.serviceEndAt,
        eventDurationHours: input.eventDurationHours,
        serviceDurations: input.serviceDurations,
      }),
    ],
    ["Fecha del evento", eventDate(input.eventDate)],
    ["Monto", currency(input.amount)],
    ["Pago recibido", currency(input.paid)],
    ["Saldo", currency(input.balance)],
    ["Estado de pago", founderPaymentStatusLabel({ total: input.amount, paid: input.paid, balance: input.balance })],
    ["Tipo de cliente", input.customerType],
  ];
  const statuses = [...input.integrations, { label: "Contrato", ready: true, value: contract }];
  const subject = "🎉 Nueva Reserva Confirmada – BOOMBOX";
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5ded2;border-radius:14px">${rows.map(([label, value], index) => `<tr><td style="width:42%;padding:12px 16px;color:#716b63;font-size:13px;vertical-align:top${index ? ";border-top:1px solid #eee7dc" : ""}">${escapeHtml(String(label))}</td><td align="right" style="padding:12px 16px;font-size:14px;font-weight:700;vertical-align:top${index ? ";border-top:1px solid #eee7dc" : ""}">${escapeHtml(String(value))}</td></tr>`).join("")}</table>`;
  const operational = `<p style="margin:28px 0 12px;color:#d76d00;font-size:11px;font-weight:700;letter-spacing:.16em">ESTADO OPERACIONAL</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#111214;border-radius:14px">${statuses.map((status) => `<tr><td style="padding:10px 16px;color:${status.ready ? "#ffffff" : "#f7b955"};font-size:13px">${status.ready ? "✓" : "⚠"} ${escapeHtml(status.label)}${"value" in status ? `: ${escapeHtml(String(status.value))}` : ""}</td></tr>`).join("")}</table>`;
  const htmlBody = renderBoomboxCommercialEmail({
    preheader: "Nueva reserva confirmada en ORBIT.",
    eyebrow: "CONFIRMACIÓN INTERNA",
    title: "NUEVA RESERVA CONFIRMADA",
    contentHtml: `${details}${operational}`,
    website: input.website,
    primaryAction: { href: input.projectUrl, label: "ABRIR EVENTO EN ORBIT" },
  });
  const textBody = [
    "Reserva completada",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "Verificación",
    ...statuses.map((status) =>
      "value" in status
        ? `${status.label}: ${status.value}`
        : `${status.ready ? "OK" : "PENDIENTE"} · ${status.label}`,
    ),
    input.projectUrl,
  ].join("\n");
  return { subject, rows, contract, htmlBody, textBody };
}
