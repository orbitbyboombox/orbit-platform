export type OperationalExtraCategory = "QR" | "IMANES" | "SCRAPBOOK" | "FONDO" | "TRASLADO" | "OTROS";

export type CanonicalOperationalExtras = {
  categories: Record<OperationalExtraCategory, boolean>;
  details: Partial<Record<OperationalExtraCategory, string[]>>;
  calendarLines: string[];
};

type Input = {
  serviceExtras?: readonly unknown[];
  postReservationExtras?: readonly unknown[];
  configuredExtras?: readonly unknown[];
  transportTotal?: number | null;
  transportContracted?: boolean;
};

const categories: readonly OperationalExtraCategory[] = ["QR", "IMANES", "SCRAPBOOK", "FONDO", "TRASLADO", "OTROS"];

const asText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return String(record.name ?? record.label ?? record.description ?? record.code ?? "").trim();
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function classify(value: string): OperationalExtraCategory {
  const normalized = normalize(value);
  if (/\bQR\b|CODIGO QR/.test(normalized)) return "QR";
  if (/IMAN|MAGNET/.test(normalized)) return "IMANES";
  if (/SCRAPBOOK|ALBUM/.test(normalized)) return "SCRAPBOOK";
  if (/FONDO|BACKDROP|TELON/.test(normalized)) return "FONDO";
  if (/TRASLADO|TRANSPORTE|FLETE/.test(normalized)) return "TRASLADO";
  return "OTROS";
}

export function buildCanonicalOperationalExtras(input: Input): CanonicalOperationalExtras {
  const names = [
    ...(input.serviceExtras ?? []),
    ...(input.postReservationExtras ?? []),
    ...(input.configuredExtras ?? []),
  ].map(asText).filter(Boolean);
  const details: Partial<Record<OperationalExtraCategory, string[]>> = {};
  const categoriesFound = new Set<OperationalExtraCategory>();
  for (const name of names) {
    const category = classify(name);
    categoriesFound.add(category);
    if (category !== "OTROS") {
      const current = details[category] ?? [];
      if (!current.includes(name)) details[category] = [...current, name];
    }
  }
  if (Number(input.transportTotal ?? 0) > 0 || input.transportContracted === true) categoriesFound.add("TRASLADO");
  const result = Object.fromEntries(categories.map((category) => [category, categoriesFound.has(category)])) as Record<OperationalExtraCategory, boolean>;
  const calendarLines = categories.map((category) => `${category}: ${result[category] ? "SÍ" : "NO"}`);
  return { categories: result, details, calendarLines };
}

export function formatCanonicalOperationalExtrasForCalendar(input: Input): string {
  return buildCanonicalOperationalExtras(input).calendarLines.join(" · ");
}
