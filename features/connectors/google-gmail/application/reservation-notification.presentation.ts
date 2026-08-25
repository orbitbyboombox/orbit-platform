import {
  canonicalEventDuration,
  commercialServiceList,
  currentCustomerContact,
} from "../../../projects/reservation-presentation.ts";

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
  paymentStatus: string;
  customerType: string;
  contractStatus: "SIGNED" | "PENDING";
  integrations: Array<{ label: string; ready: boolean }>;
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
    ["Fecha del evento", input.eventDate],
    ["Monto", currency(input.amount)],
    ["Estado de pago", input.paymentStatus],
    ["Tipo de cliente", input.customerType],
  ];
  const statuses = [...input.integrations, { label: "Contrato", ready: true, value: contract }];
  const subject = "🎉 Nueva Reserva Confirmada – BOOMBOX";
  const htmlBody = `<main style="font-family:Arial,sans-serif;color:#171717"><h1>🎉 Nueva Reserva Confirmada</h1><table style="border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px;color:#666">${escapeHtml(String(label))}</td><td style="padding:7px 12px;font-weight:700">${escapeHtml(String(value))}</td></tr>`).join("")}</table><h2>Verificación</h2><ul>${statuses.map((status) => `<li>${status.ready ? "✅" : "⚠️"} ${escapeHtml(status.label)}${"value" in status ? `: ${escapeHtml(String(status.value))}` : ""}</li>`).join("")}</ul><p><a href="${escapeHtml(input.projectUrl)}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Abrir Evento en ORBIT</a></p></main>`;
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
