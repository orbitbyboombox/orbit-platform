export type GlobalSearchKind = "CUSTOMER" | "EVENT" | "QUOTE";

export interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle: string;
  href: string;
}

export const GLOBAL_SEARCH_GROUPS: ReadonlyArray<{
  kind: GlobalSearchKind;
  label: string;
}> = [
  { kind: "CUSTOMER", label: "Clientes" },
  { kind: "EVENT", label: "Eventos" },
  { kind: "QUOTE", label: "Cotizaciones" },
];

export function normalizeGlobalSearchTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]/g, "");
}

export function globalSearchHref(kind: GlobalSearchKind, id: string) {
  if (kind === "CUSTOMER") return `/customers/${id}`;
  if (kind === "EVENT") return `/projects/${id}`;
  return `/api/commercial/quotes/${id}/pdf`;
}

