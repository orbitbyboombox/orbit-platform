import type { CommercialValue, Money, ServiceId } from "../types";

const REQUIRES_OFFICIAL_PRICE: CommercialValue<Money> = { status: "REQUIRES_QUOTE", value: null };

export const SERVICE_BASE_PRICES: Readonly<Record<ServiceId, CommercialValue<Money>>> = {
  CLASSIC: REQUIRES_OFFICIAL_PRICE,
  POLAROID: REQUIRES_OFFICIAL_PRICE,
  BLACK_STUDIO: REQUIRES_OFFICIAL_PRICE,
  BBOX360: REQUIRES_OFFICIAL_PRICE,
  LIGHTBOX: REQUIRES_OFFICIAL_PRICE,
  BOOMBALL: REQUIRES_OFFICIAL_PRICE,
  HASHTAG: REQUIRES_OFFICIAL_PRICE,
};

export function getServiceBasePrice(serviceId: ServiceId): CommercialValue<Money> {
  return SERVICE_BASE_PRICES[serviceId];
}
