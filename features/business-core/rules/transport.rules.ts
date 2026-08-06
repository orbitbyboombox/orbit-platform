import type { CommercialValue, Money, TransportRate } from "../types";

const clp = (amount: number): CommercialValue<Money> => ({ status: "DEFINED", value: { amount, currency: "CLP" } });
export const TRANSPORT_RATES: readonly TransportRate[] = [
  { id: "santiago-province", origin: "Chicureo", destination: "Provincia de Santiago", price: clp(0) },
  { id: "other-santiago-province", origin: "Chicureo", destination: "Otra provincia de Santiago", price: clp(35_000) },
  { id: "chacabuco", origin: "Chicureo", destination: "Chacabuco", price: clp(55_000) },
  { id: "cordillera", origin: "Chicureo", destination: "Cordillera", price: clp(70_000) },
  { id: "maipo", origin: "Chicureo", destination: "Maipo", price: clp(60_000) },
  { id: "melipilla", origin: "Chicureo", destination: "Melipilla", price: clp(75_000) },
  { id: "talagante", origin: "Chicureo", destination: "Talagante", price: clp(80_000) },
  { id: "interior-regions", origin: "Chicureo", destination: "Regiones interiores", price: clp(120_000) },
];

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
