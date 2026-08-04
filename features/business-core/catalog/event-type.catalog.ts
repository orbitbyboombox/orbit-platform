import type { EventTypeCatalogItem, EventTypeId } from "../types";

export const EVENT_TYPE_CATALOG = [
  { id: "COMPANY", name: "Empresa", category: "CORPORATE" },
  { id: "WEDDING", name: "Matrimonio", category: "SOCIAL" },
  { id: "BIRTHDAY", name: "Cumpleaños", category: "SOCIAL" },
  { id: "GRADUATION", name: "Graduación", category: "SOCIAL" },
  { id: "PARTY", name: "Fiesta", category: "SOCIAL" },
  { id: "OTHER", name: "Otro", category: "OTHER" },
] as const satisfies readonly EventTypeCatalogItem[];

export const EVENT_TYPE_CATALOG_BY_ID: Readonly<Record<EventTypeId, EventTypeCatalogItem>> = Object.fromEntries(
  EVENT_TYPE_CATALOG.map((eventType) => [eventType.id, eventType]),
) as unknown as Readonly<Record<EventTypeId, EventTypeCatalogItem>>;

export function getEventType(eventTypeId: EventTypeId): EventTypeCatalogItem {
  return EVENT_TYPE_CATALOG_BY_ID[eventTypeId];
}
