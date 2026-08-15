export const COMMERCIAL_CATALOGS = {
  WEDDINGS: { slug: "novios", label: "Matrimonios / Novios", emailContext: "Matrimonios" },
  COMPANIES: { slug: "empresas", label: "Empresas", emailContext: "Empresas" },
  EVENTS: { slug: "eventos", label: "Eventos", emailContext: "Eventos" },
} as const;

export type CommercialCatalogCategory = keyof typeof COMMERCIAL_CATALOGS;
export type CommercialCatalogSlug = (typeof COMMERCIAL_CATALOGS)[CommercialCatalogCategory]["slug"];

export type QuickSendCatalogCategory =
  | "WEDDINGS"
  | "BIRTHDAYS"
  | "GRADUATIONS"
  | "COMPANIES_CATALOG";

const QUICK_SEND_CATALOGS: Record<QuickSendCatalogCategory, CommercialCatalogCategory> = {
  WEDDINGS: "WEDDINGS",
  BIRTHDAYS: "EVENTS",
  GRADUATIONS: "EVENTS",
  COMPANIES_CATALOG: "COMPANIES",
};

export function isCommercialCatalogCategory(value: string): value is CommercialCatalogCategory {
  return Object.hasOwn(COMMERCIAL_CATALOGS, value);
}

export function catalogCategoryFromSlug(slug: string): CommercialCatalogCategory | null {
  const entry = Object.entries(COMMERCIAL_CATALOGS).find(([, value]) => value.slug === slug);
  return (entry?.[0] as CommercialCatalogCategory | undefined) ?? null;
}

export function catalogCategoryForQuickSend(category: QuickSendCatalogCategory) {
  return QUICK_SEND_CATALOGS[category];
}

export function activeCommercialDocument<T extends { category: string; status: string }>(
  documents: T[],
  category: CommercialCatalogCategory,
) {
  return documents.find(
    (document) => document.category === category && document.status === "ACTIVE",
  );
}

export function pendingCommercialDocuments<T extends { category: string; status: string }>(
  documents: T[],
  category: CommercialCatalogCategory,
) {
  return documents.filter(
    (document) => document.category === category && document.status === "PENDING",
  );
}

export function catalogPublicPath(category: CommercialCatalogCategory) {
  return `/catalogo/${COMMERCIAL_CATALOGS[category].slug}`;
}

export function catalogPublicUrl(category: CommercialCatalogCategory, origin = "https://orbit.boom-box.cl") {
  return `${origin.replace(/\/$/, "")}${catalogPublicPath(category)}`;
}

export function validateCommercialUpload(input: { mimeType: string; size: number }) {
  if (input.mimeType !== "application/pdf") return "El documento debe ser PDF.";
  if (input.size <= 0) return "Selecciona un PDF.";
  if (input.size > 30 * 1024 * 1024) return "El PDF supera 30 MB.";
  return null;
}

export function validateSignatureUpload(input: { mimeType: string; size: number }) {
  const allowed = ["image/gif", "image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(input.mimeType)) return "Usa GIF, PNG, JPG o WebP.";
  if (input.size <= 0) return "Selecciona una imagen.";
  if (input.size > 10 * 1024 * 1024) return "La firma supera 10 MB.";
  return null;
}
