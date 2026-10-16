type ExtraItem = {
  item_type?: unknown;
  name?: unknown;
  label?: unknown;
  description?: unknown;
  status?: unknown;
};

type EventEquipmentExtrasInput = {
  serviceExtras?: readonly unknown[];
  postReservationExtras?: readonly ExtraItem[];
  acceptedQuotationItems?: readonly ExtraItem[];
};

const GENERIC_EXTRA_LABELS = new Set([
  "SIN EXTRAS",
  "SEGUN EXTRAS",
  "SEGUN COTIZACION",
  "SIN REGISTRO",
]);

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return String(record.name ?? record.label ?? record.description ?? "").trim();
}

function addUnique(target: string[], value: unknown): void {
  const label = text(value);
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (!label || GENERIC_EXTRA_LABELS.has(normalized)) return;
  if (!target.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) {
    target.push(label);
  }
}

function isExtraItem(item: ExtraItem): boolean {
  const type = String(item.item_type ?? "").trim().toUpperCase();
  return type === "EXTRA" || type === "EXTRAS" || type === "ADD_ON" || type === "SERVICE_EXTRA";
}

/** Read-only, canonical presentation model. It never invents an extra. */
export function buildEventEquipmentExtras(input: EventEquipmentExtrasInput): string[] {
  const result: string[] = [];
  for (const item of input.serviceExtras ?? []) addUnique(result, item);
  for (const item of input.postReservationExtras ?? []) {
    if (String(item.status ?? "").toUpperCase() === "ACTIVE") addUnique(result, item);
  }
  for (const item of input.acceptedQuotationItems ?? []) {
    if (isExtraItem(item)) addUnique(result, item);
  }
  return result;
}
