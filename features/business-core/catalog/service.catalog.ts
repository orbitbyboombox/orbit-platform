import type { ServiceCatalogItem, ServiceId } from "../types";

export const SERVICE_CATALOG = [
  { id: "CLASSIC", name: "Classic", requiresPhotoStripDesign: true, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "POLAROID", name: "Polaroid", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "BLACK_STUDIO", name: "Black Studio", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "BBOX360", name: "BBOX360", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "LIGHTBOX", name: "LightBox", requiresPhotoStripDesign: false, duration: { mode: "FIXED", availableHours: [5], fixedHours: 5, shouldRequestDuration: false } },
  { id: "BOOMBALL", name: "BoomBall", requiresPhotoStripDesign: false, duration: { mode: "SINGLE_SERVICE", availableHours: [], shouldRequestDuration: false } },
  { id: "HASHTAG", name: "Hashtag", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "INSTABOX", name: "Instabox", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
  { id: "VIDEO_LOUNGE", name: "Video Lounge", requiresPhotoStripDesign: false, duration: { mode: "SELECTABLE", availableHours: [2, 3, 4], shouldRequestDuration: true } },
] as const satisfies readonly ServiceCatalogItem[];

export const SERVICE_CATALOG_BY_ID: Readonly<Record<ServiceId, ServiceCatalogItem>> = Object.fromEntries(
  SERVICE_CATALOG.map((service) => [service.id, service]),
) as unknown as Readonly<Record<ServiceId, ServiceCatalogItem>>;

export function getService(serviceId: ServiceId): ServiceCatalogItem {
  return SERVICE_CATALOG_BY_ID[serviceId];
}

export function requiresPhotoStripDesign(serviceCodes: readonly string[]): boolean {
  return serviceCodes.some((code) => SERVICE_CATALOG_BY_ID[code as ServiceId]?.requiresPhotoStripDesign === true);
}
