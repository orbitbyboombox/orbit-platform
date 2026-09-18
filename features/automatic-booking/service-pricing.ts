export class ServicePriceUnavailableError extends Error {
  readonly code = "SERVICE_PRICE_UNAVAILABLE" as const;
  readonly serviceCode: string;
  readonly pricingMode: "FIXED" | "DURATION";
  readonly requestedDuration: number | null;
  constructor(serviceCode: string, pricingMode: "FIXED" | "DURATION", requestedDuration: number | null) {
    super(`El servicio ${serviceCode} no tiene precio aprobado para la configuración solicitada.`);
    this.name = "ServicePriceUnavailableError";
    this.serviceCode = serviceCode;
    this.pricingMode = pricingMode;
    this.requestedDuration = requestedDuration;
  }
}

export type ServicePriceRow = { duration_hours: number | null; unit_price: number | null; rules: unknown };

/** Resolve one service from the canonical commercial price rows. */
export function resolveServicePrice(input: { serviceCode: string; requestedDuration: number; rows: ServicePriceRow[]; fixedHours?: number }) {
  const fixedPrice = input.rows.find((price) => (price.rules as Record<string, unknown> | null)?.fixed === true);
  if (fixedPrice) {
    if (fixedPrice.unit_price != null && Number(fixedPrice.unit_price) >= 0) {
      return { amount: Number(fixedPrice.unit_price), hours: null as number | null, pricingMode: "FIXED" as const };
    }
    throw new ServicePriceUnavailableError(input.serviceCode, "FIXED", null);
  }
  const exact = input.rows.find((price) => Number(price.duration_hours) === input.requestedDuration)
    ?? (input.requestedDuration === input.fixedHours ? input.rows.find((price) => price.duration_hours === null) : undefined);
  if (!exact || exact.unit_price == null || Number(exact.unit_price) < 0) {
    throw new ServicePriceUnavailableError(input.serviceCode, "DURATION", input.requestedDuration);
  }
  return { amount: Number(exact.unit_price), hours: input.requestedDuration, pricingMode: "DURATION" as const };
}
