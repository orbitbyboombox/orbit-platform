import { SERVICE_CATALOG_BY_ID } from "../business-core/catalog/service.catalog.ts";
import { QUOTATION_EXTRA_RULES } from "../business-core/rules/quotation-extra.rules.ts";

type CustomerPresentationInput = {
  fullName?: string | null;
  metadata?: unknown;
};

type DurationPresentationInput = {
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  eventDurationHours?: number | null;
  serviceDurations?: Array<number | null | undefined>;
};

export function commercialServiceLabel(code: string) {
  const normalized = code.trim().toUpperCase();
  const service = (
    SERVICE_CATALOG_BY_ID as Readonly<Record<string, { name: string }>>
  )[normalized];
  if (service?.name) return service.name;
  const extra = (
    QUOTATION_EXTRA_RULES as Readonly<Record<string, { label: string }>>
  )[normalized];
  if (extra?.label) return extra.label;
  return normalized
    .toLocaleLowerCase("es-CL")
    .replaceAll("_", " ")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("es-CL"));
}

export function commercialServiceList(codes: string[]) {
  return (
    Array.from(new Set(codes.filter(Boolean))).map(commercialServiceLabel).join(" + ") ||
    "Sin servicio"
  );
}

export function canonicalEventDurationHours(input: DurationPresentationInput) {
  if (input.serviceStartAt && input.serviceEndAt) {
    const start = new Date(input.serviceStartAt).getTime();
    const end = new Date(input.serviceEndAt).getTime();
    const scheduledHours = (end - start) / 3_600_000;
    if (Number.isFinite(scheduledHours) && scheduledHours > 0) return scheduledHours;
  }
  if (
    typeof input.eventDurationHours === "number" &&
    Number.isFinite(input.eventDurationHours) &&
    input.eventDurationHours > 0
  )
    return input.eventDurationHours;
  const serviceDuration = Math.max(
    0,
    ...(input.serviceDurations ?? []).map((value) => Number(value ?? 0)),
  );
  return serviceDuration || null;
}

export function canonicalEventDuration(input: DurationPresentationInput) {
  const hours = canonicalEventDurationHours(input);
  if (!hours) return "Por confirmar";
  const formatted = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(hours);
  return `${formatted} ${hours === 1 ? "hora" : "horas"}`;
}

export function currentCustomerContact(input: CustomerPresentationInput) {
  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : {};
  const primary =
    metadata.primaryContact && typeof metadata.primaryContact === "object"
      ? (metadata.primaryContact as Record<string, unknown>)
      : {};
  const primaryName = [primary.firstName, primary.lastName]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim())
    .join(" ");
  return primaryName || input.fullName?.trim() || "Sin cliente";
}
