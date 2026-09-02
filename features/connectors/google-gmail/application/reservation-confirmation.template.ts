import {
  customerCommercialPresentation,
  currentCustomerContact,
  type CustomerCommercialItem,
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
  commercialItems?: CustomerCommercialItem[];
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  eventDurationHours?: number | null;
  serviceDurations?: Array<number | null | undefined>;
  transport: number;
  total: number;
  paid: number;
  balance: number;
  portalAvailable: boolean;
  companyCommercial?: boolean;
};

export function buildReservationConfirmationTemplate(
  input: ReservationConfirmationTemplateInput,
) {
  const customer = currentCustomerContact(input.customer);
  const commercial = customerCommercialPresentation({
    serviceCodes: input.serviceCodes,
    commercialItems: input.commercialItems,
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
    `Hola ${customer},`,
    "BIENVENIDOS A BOOMBOX",
    "Tu reserva ha sido confirmada correctamente.",
    input.companyCommercial
      ? "Adjuntamos tu documento comercial oficial con el detalle completo de las condiciones de tu reserva."
      : "Ponemos a disposición tu documento comercial oficial con el detalle completo de las condiciones de tu reserva.",
    "Desde este momento, la información esencial de tu evento también está disponible en Mi Evento.",
    "SERVICIO CONTRATADO",
    `Servicio\n${commercial.service}`,
    `Duración\n${commercial.duration}`,
    `Extras\n${commercial.extrasLabel}`,
    "INFORMACIÓN DEL EVENTO",
    `Fecha\n${eventDate(input.eventDate)}`,
    `Horario\n${input.eventTime?.slice(0, 5) || "Por confirmar"}`,
    `Lugar\n${venue}`,
    "VALOR DEL SERVICIO CONTRATADO",
    `Valor total\n${money(input.total)}`,
    `Abono recibido\n${money(input.paid)}`,
    `Saldo pendiente\n${money(input.balance)}`,
    ...(input.portalAvailable ? ["ABRIR EVENTO EN ORBIT"] : []),
    "Si necesitas modificar algún dato o tienes alguna consulta, puedes responder directamente a este correo.",
    "Nos vemos pronto.",
    "Equipo BOOMBOX",
  ].join("\n\n");
  return {
    subject,
    body,
    customer,
    services: commercial.service,
    extras: commercial.extrasLabel,
    duration: commercial.duration,
    venue,
  };
}
