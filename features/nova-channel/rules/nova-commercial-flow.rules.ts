import { SERVICE_CATALOG, type DurationHours } from "@/features/business-core";
import type { CustomerMemoryField, CustomerMemoryRecord } from "@/features/customer-memory";
import type { NovaNextAction } from "../types/nova-channel.types";

export const NOVA_COMMERCIAL_FIELD_ORDER = ["eventType", "eventLocation", "eventDate", "estimatedGuests"] as const satisfies readonly CustomerMemoryField[];

export const NOVA_COMMERCIAL_QUESTIONS: Readonly<Record<(typeof NOVA_COMMERCIAL_FIELD_ORDER)[number], string>> = {
  eventType: "¿Qué tipo de evento estás organizando?",
  eventLocation: "¿Dónde se realizará el evento?",
  eventDate: "¿Cuál es la fecha del evento?",
  estimatedGuests: "¿Cuántos invitados estimas?",
};

export function recommendHours(estimatedGuests: number): DurationHours {
  if (estimatedGuests <= 70) return 2;
  if (estimatedGuests <= 130) return 3;
  return 4;
}

export function getFirstMissingCommercialField(memory: CustomerMemoryRecord) {
  return NOVA_COMMERCIAL_FIELD_ORDER.find((field) => memory[field] === undefined || memory[field] === null || memory[field] === "");
}

export function actionForMissingField(field: (typeof NOVA_COMMERCIAL_FIELD_ORDER)[number]): NovaNextAction {
  return ({ eventType: "ASK_EVENT_TYPE", eventLocation: "ASK_LOCATION", eventDate: "ASK_EVENT_DATE", estimatedGuests: "ASK_ESTIMATED_GUESTS" } as const)[field];
}

export function getCatalogServiceRecommendation() {
  return SERVICE_CATALOG[0];
}
