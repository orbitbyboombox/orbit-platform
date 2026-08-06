import type { CommercialValue, Money, ServiceId } from "../types";

export type QuotationDuration = 2 | 3 | 4;
export interface ServicePriceRule {
  readonly prices: Readonly<Partial<Record<QuotationDuration, Money>>>;
  readonly fixedPrice?: Money;
}

const clp = (amount: number): Money => ({ amount, currency: "CLP" });
const REQUIRES_OFFICIAL_PRICE: CommercialValue<Money> = { status: "REQUIRES_QUOTE", value: null };

export const SERVICE_PRICE_MATRIX: Readonly<Record<ServiceId, ServicePriceRule>> = {
  CLASSIC: { prices: { 2: clp(250_000), 3: clp(290_000), 4: clp(330_000) } },
  POLAROID: { prices: { 2: clp(330_000), 3: clp(390_000), 4: clp(450_000) } },
  BLACK_STUDIO: { prices: { 2: clp(390_000), 3: clp(470_000), 4: clp(520_000) } },
  BBOX360: { prices: { 2: clp(250_000), 3: clp(300_000), 4: clp(360_000) } },
  HASHTAG: { prices: { 2: clp(250_000), 3: clp(300_000), 4: clp(350_000) } },
  LIGHTBOX: { prices: {}, fixedPrice: clp(220_000) },
  BOOMBALL: { prices: {}, fixedPrice: clp(280_000) },
  INSTABOX: { prices: {} },
  VIDEO_LOUNGE: { prices: {} },
};

export const SERVICE_BASE_PRICES: Readonly<Record<ServiceId, CommercialValue<Money>>> = Object.fromEntries(
  Object.entries(SERVICE_PRICE_MATRIX).map(([service, rule]) => [service, rule.fixedPrice ? { status: "DEFINED", value: rule.fixedPrice } : rule.prices[2] ? { status: "DEFINED", value: rule.prices[2] } : REQUIRES_OFFICIAL_PRICE]),
) as Readonly<Record<ServiceId, CommercialValue<Money>>>;

export function getServiceBasePrice(serviceId: ServiceId): CommercialValue<Money> {
  return SERVICE_BASE_PRICES[serviceId];
}

export function getServicePrice(serviceId: ServiceId, duration: QuotationDuration): CommercialValue<Money> {
  const rule = SERVICE_PRICE_MATRIX[serviceId];
  const value = rule.fixedPrice ?? rule.prices[duration];
  return value ? { status: "DEFINED", value } : REQUIRES_OFFICIAL_PRICE;
}

export function calculateAdditionalHourPrice(serviceId: ServiceId, duration: QuotationDuration): CommercialValue<Money> {
  const price = getServicePrice(serviceId, duration);
  if (price.status !== "DEFINED") return REQUIRES_OFFICIAL_PRICE;
  return { status: "DEFINED", value: clp(Math.round(price.value.amount / duration)) };
}
