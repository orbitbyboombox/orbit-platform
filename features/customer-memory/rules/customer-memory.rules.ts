import type { CustomerMemoryField } from "../types/customer-memory.types";

export const CUSTOMER_CONVERSATION_FIELD_ORDER: readonly CustomerMemoryField[] = [
  "customerName",
  "eventType",
  "eventDate",
  "eventLocation",
  "estimatedGuests",
  "recommendedHours",
  "selectedService",
] as const;

export const CUSTOMER_MEMORY_QUESTIONS: Readonly<Partial<Record<CustomerMemoryField, string>>> = {
  customerName: "¿Cuál es tu nombre?",
  eventType: "¿Qué tipo de evento estás organizando?",
  eventDate: "¿Cuál es la fecha del evento?",
  eventLocation: "¿Dónde se realizará el evento?",
  estimatedGuests: "¿Cuántos invitados estimas?",
  recommendedHours: "¿Cuántas horas necesitas para la experiencia?",
  selectedService: "¿Qué servicio BOOMBOX prefieres?",
};

export const INTERNAL_MEMORY_DEFAULTS = {
  quotationStatus: "NOT_STARTED",
  reservationStatus: "NOT_STARTED",
  paymentStatus: "NOT_STARTED",
  portalStatus: "NOT_CREATED",
} as const;
