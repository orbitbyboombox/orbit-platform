import type { ServiceCatalogItem, ServiceId } from "../types";

export const SERVICE_CATALOG = [
  { id: "CLASSIC", name: "Classic", duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "POLAROID", name: "Polaroid", duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "BLACK_STUDIO", name: "Black Studio", duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "BBOX360", name: "BBOX360", duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "LIGHTBOX", name: "LightBox", duration: { mode: "FIXED", availableHours: [5], fixedHours: 5, shouldRequestDuration: false } },
  { id: "BOOMBALL", name: "BoomBall", duration: { mode: "SINGLE_SERVICE", availableHours: [], shouldRequestDuration: false } },
  { id: "HASHTAG", name: "Hashtag", duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
] as const satisfies readonly ServiceCatalogItem[];

export const SERVICE_CATALOG_BY_ID: Readonly<Record<ServiceId, ServiceCatalogItem>> = Object.fromEntries(
  SERVICE_CATALOG.map((service) => [service.id, service]),
) as unknown as Readonly<Record<ServiceId, ServiceCatalogItem>>;

export function getService(serviceId: ServiceId): ServiceCatalogItem {
  return SERVICE_CATALOG_BY_ID[serviceId];
}
