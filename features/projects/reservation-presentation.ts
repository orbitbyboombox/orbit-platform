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

export type CustomerCommercialItem = {
  code?: string | null;
  label?: string | null;
  itemType?: string | null;
  total?: number | null;
};

export type CustomerCommercialPresentationInput = DurationPresentationInput & {
  serviceCodes: string[];
  commercialItems?: CustomerCommercialItem[];
};

export type AcceptedCommercialFinancialFallback = {
  subtotal?: number | null;
  discountTotal?: number | null;
  taxTotal?: number | null;
  grandTotal?: number | null;
  finalCustomerPrice?: number | null;
  depositPercent?: number | null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const finite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function acceptedCommercialFinancialPresentation(
  acceptedSnapshot: unknown,
  fallback: AcceptedCommercialFinancialFallback = {},
) {
  const snapshot = record(acceptedSnapshot);
  const commercial = record(snapshot.commercial);
  const quotation = record(snapshot.quotation);
  const subtotal = finite(
    commercial.subtotal,
    finite(quotation.subtotal, finite(fallback.subtotal)),
  );
  const discount = finite(
    commercial.discount,
    finite(quotation.discountTotal, finite(fallback.discountTotal)),
  );
  const net = finite(commercial.net, Math.max(0, subtotal - discount));
  const vat = finite(
    commercial.tax,
    finite(quotation.taxTotal, finite(fallback.taxTotal)),
  );
  const total = finite(
    commercial.total,
    finite(
      quotation.grandTotal,
      finite(
        fallback.finalCustomerPrice,
        finite(fallback.grandTotal, net + vat),
      ),
    ),
  );
  const depositPercent = finite(
    commercial.depositPercent,
    finite(quotation.depositPercent, finite(fallback.depositPercent, 50)),
  );
  const deposit = finite(
    commercial.deposit,
    Math.round((total * depositPercent) / 100),
  );
  const balance = finite(
    commercial.balance,
    Math.max(0, total - deposit),
  );
  return { net, vat, total, depositPercent, deposit, balance };
}

export function customerCommercialItemsFromSnapshot(
  acceptedSnapshot: unknown,
): CustomerCommercialItem[] {
  if (!acceptedSnapshot || typeof acceptedSnapshot !== "object") return [];
  const items = (acceptedSnapshot as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const code = String(item.code ?? "").trim();
    if (!code) return [];
    const total = item.total == null ? Number.NaN : Number(item.total);
    return [
      {
        code,
        label: String(item.label ?? "").trim() || null,
        itemType: String(item.itemType ?? "").trim() || null,
        total: Number.isFinite(total) ? total : null,
      },
    ];
  });
}

export function customerCommercialItemsFromLegacyQuote(
  items: Array<{
    label?: string | null;
    description?: string | null;
    total?: number | null;
  }>,
): CustomerCommercialItem[] {
  return items.flatMap((item) => {
    const label = String(item.label ?? item.description ?? "").trim();
    const comparable = label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!comparable || /TRANSPORT/.test(comparable)) return [];
    const extraCode = Object.entries(
      QUOTATION_EXTRA_RULES as Readonly<Record<string, { label: string }>>,
    ).find(([code, rule]) => {
      const commercialLabel = rule.label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_");
      return comparable === code || commercialLabel.includes(comparable) || comparable.includes(commercialLabel);
    })?.[0];
    if (/IMAN/.test(comparable)) {
      return [{ code: "UNLIMITED_MAGNETS", label, itemType: "EXTRA", total: item.total ?? null }];
    }
    if (extraCode)
      return [{ code: extraCode, label, itemType: "EXTRA", total: item.total ?? null }];
    return [];
  });
}

const clp = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

function isExtraCode(code: string) {
  return Boolean(
    (
      QUOTATION_EXTRA_RULES as Readonly<Record<string, { label: string }>>
    )[code.trim().toUpperCase()],
  );
}

function isServiceCode(code: string) {
  return Boolean(
    (SERVICE_CATALOG_BY_ID as Readonly<Record<string, { name: string }>>)[
      code.trim().toUpperCase()
    ],
  );
}

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

export function customerCommercialPresentation(
  input: CustomerCommercialPresentationInput,
) {
  const items = input.commercialItems ?? [];
  const primaryCodes = Array.from(
    new Set(
      [
        ...input.serviceCodes.filter((code) => !isExtraCode(code)),
        ...items
          .filter((item) => {
            const code = item.code?.trim() ?? "";
            return (
              Boolean(code) &&
              !isExtraCode(code) &&
              (isServiceCode(code) || item.itemType?.toUpperCase() === "SERVICE")
            );
          })
          .map((item) => item.code?.trim() ?? ""),
      ].filter(Boolean),
    ),
  );
  const extras = new Map<
    string,
    { code: string; label: string; total: number | null }
  >();
  for (const item of items) {
    const code = item.code?.trim() ?? "";
    if (!code || (!isExtraCode(code) && item.itemType?.toUpperCase() !== "EXTRA"))
      continue;
    const key = code.toUpperCase();
    const current = extras.get(key);
    const amount =
      typeof item.total === "number" && Number.isFinite(item.total)
        ? item.total
        : null;
    extras.set(key, {
      code,
      label: isExtraCode(code)
        ? commercialServiceLabel(code)
        : item.label?.trim() || commercialServiceLabel(code),
      total:
        current?.total == null || amount == null
          ? current?.total ?? amount
          : current.total + amount,
    });
  }
  for (const code of input.serviceCodes.filter(isExtraCode)) {
    const key = code.trim().toUpperCase();
    if (!extras.has(key)) {
      extras.set(key, {
        code,
        label: commercialServiceLabel(code),
        total: null,
      });
    }
  }
  const duration = canonicalEventDuration(input);
  const service = commercialServiceList(primaryCodes);
  const extraLines = [...extras.values()].map((extra) =>
    extra.total == null
      ? extra.label
      : `${extra.label} · ${extra.total === 0 ? "Gratis" : clp(extra.total)}`,
  );
  return {
    service,
    duration,
    serviceWithDuration: `${service} · ${duration}`,
    extras: extraLines,
    extrasLabel: extraLines.join(" · ") || "Sin extras",
  };
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
