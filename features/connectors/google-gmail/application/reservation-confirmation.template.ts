import {
  canonicalEventDuration,
  commercialServiceList,
  currentCustomerContact,
} from "../../../projects/reservation-presentation.ts";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const eventDate = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));

export type ReservationConfirmationTemplateInput = {
  customer: { fullName?: string | null; metadata?: unknown };
  eventName: string;
  eventDate: string;
  eventTime?: string | null;
  venue?: string | null;
  city?: string | null;
  serviceCodes: string[];
  commercialLabels?: string[];
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  eventDurationHours?: number | null;
  serviceDurations?: Array<number | null | undefined>;
  total: number;
  paid: number;
  balance: number;
  portalAvailable: boolean;
};

export function buildReservationConfirmationTemplate(
  input: ReservationConfirmationTemplateInput,
) {
  const customer = currentCustomerContact(input.customer);
  const services = input.commercialLabels?.filter(Boolean).length
    ? Array.from(new Set(input.commercialLabels?.map((value) => value.trim()))).join(" + ")
    : commercialServiceList(input.serviceCodes);
  const duration = canonicalEventDuration({
    serviceStartAt: input.serviceStartAt,
    serviceEndAt: input.serviceEndAt,
    eventDurationHours: input.eventDurationHours,
    serviceDurations: input.serviceDurations,
  });
  const venue = [input.venue?.trim(), input.city?.trim()]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ") || "Por confirmar";
  const subject = "¡Tu reserva BOOMBOX está confirmada!";
  const body = [
    "¡Tu reserva BOOMBOX está confirmada!",
    `Hola ${customer},`,
    "¡Muchas gracias por confiar en BOOMBOX!",
    `Tu reserva para ${input.eventName || "tu evento"} ha quedado confirmada.`,
    `Fecha: ${eventDate(input.eventDate)}`,
    `Horario: ${input.eventTime?.slice(0, 5) || "Por confirmar"}`,
    `Servicio: ${services}`,
    `Duración: ${duration}`,
    `Lugar: ${venue}`,
    `Valor total: ${money(input.total)}`,
    `Abono recibido: ${money(input.paid)}`,
    `Saldo pendiente: ${money(input.balance)}`,
    input.portalAvailable
      ? "Puedes revisar la información de tu evento y los documentos disponibles desde tu Portal BOOMBOX."
      : "Los documentos e información de tu evento estarán disponibles desde tu Portal BOOMBOX.",
    "Si necesitas modificar algún dato o tienes alguna consulta, puedes responder directamente a este correo.",
    "Nos vemos pronto.",
    "Equipo BOOMBOX",
  ].join("\n\n");
  return { subject, body, customer, services, duration, venue };
}
