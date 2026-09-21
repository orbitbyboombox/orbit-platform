import { createHash } from "node:crypto";

export type BiancaQuoteFingerprintInput = {
  customerId: string;
  activeOpportunityId: string;
  serviceCodes: readonly string[];
  durationHours?: number;
  eventDate: string;
  eventTime?: string;
  location?: string;
  commune?: string;
  province?: string;
  addons?: readonly string[];
  quantities?: Readonly<Record<string, number>>;
  customerType?: string;
};

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("es-CL");
}

export function normalizeBiancaQuoteFingerprint(input: BiancaQuoteFingerprintInput) {
  const normalized = {
    customerId: normalizeText(input.customerId),
    activeOpportunityId: normalizeText(input.activeOpportunityId),
    serviceCodes: [...input.serviceCodes].map(normalizeText).sort(),
    durationHours: input.durationHours ?? null,
    eventDate: normalizeText(input.eventDate),
    eventTime: normalizeText(input.eventTime),
    location: normalizeText(input.location),
    commune: normalizeText(input.commune),
    province: normalizeText(input.province),
    addons: [...(input.addons ?? [])].map(normalizeText).sort(),
    quantities: Object.fromEntries(Object.entries(input.quantities ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    customerType: normalizeText(input.customerType),
  };
  return JSON.stringify(normalized);
}

export function biancaQuoteFingerprint(input: BiancaQuoteFingerprintInput) {
  return createHash("sha256").update(normalizeBiancaQuoteFingerprint(input)).digest("hex");
}
