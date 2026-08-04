import type { CommercialValue, Money, TransportRate } from "../types";

export const TRANSPORT_RATES: readonly TransportRate[] = [];

export const DEFAULT_TRANSPORT_RULE: CommercialValue<Money> = {
  status: "REQUIRES_QUOTE",
  value: null,
};

export const TRANSPORT_TABLE = {
  rates: TRANSPORT_RATES,
  fallback: DEFAULT_TRANSPORT_RULE,
} as const;

export function getTransportRate(origin: string, destination: string): CommercialValue<Money> {
  const normalizedOrigin = origin.trim().toLocaleLowerCase("es-CL");
  const normalizedDestination = destination.trim().toLocaleLowerCase("es-CL");
  return TRANSPORT_TABLE.rates.find((rate) => rate.origin.toLocaleLowerCase("es-CL") === normalizedOrigin && rate.destination.toLocaleLowerCase("es-CL") === normalizedDestination)?.price ?? TRANSPORT_TABLE.fallback;
}
