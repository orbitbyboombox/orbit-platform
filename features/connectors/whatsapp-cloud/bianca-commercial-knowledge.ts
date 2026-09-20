import { catalogPublicUrl } from "../../commercial-hub/catalogs.ts";

/**
 * Stable, non-sensitive commercial vocabulary for BIANCA.
 *
 * Prices and availability are intentionally absent: those come from the
 * canonical commercial lookup (`commercial_prices`) at runtime.
 */

export const BIANCA_CANONICAL_CATALOG_LINKS = {
  WEDDINGS: catalogPublicUrl("WEDDINGS"),
  COMPANIES: catalogPublicUrl("COMPANIES"),
  EVENTS: catalogPublicUrl("EVENTS"),
} as const;

const SERVICE_CONTEXT: Record<string, string> = {
  classic: "Classic: formato 5 × 15 cm; 3 fotografías y 2 impresiones por sesión.",
  polaroid: "Polaroid: formato 7,5 × 10 cm; 2 impresiones por sesión; cantidad de fotos no especificada, no inventarla.",
  "black studio": "Black Studio: servicio fotográfico BOOMBOX; duración y precio solo desde consulta comercial.",
  bbox360: "BBOX360: experiencia/servicio BOOMBOX; duración, precio y capacidad solo desde consulta comercial.",
  lightbox: "LightBox: servicio BOOMBOX de configuración fija; no inventar duración ni precio.",
  boomball: "BoomBall: oferta de precio fijo; no exigir ni inventar duración; confirmar monto mediante consulta comercial.",
  hashtag: "Hashtag: servicio BOOMBOX; duración, precio y capacidad solo desde consulta comercial.",
  instabox: "Instabox: requiere cotización oficial según evento; nunca inventar precio.",
  "video lounge": "Video Lounge: requiere cotización oficial según evento; nunca inventar precio.",
};

const TOPIC_PATTERNS = {
  totem: /\b(?:t[oó]tem|totem|cabina|cabinas)\b/i,
  formats: /\b(?:formato|formatos|impresi[oó]n|impresiones|tira|polaroid|classic)\b/i,
  photoIa: /\b(?:photo\s*ia|fotos?\s+ia|inteligencia\s+artificial)\b/i,
  catalog: /\b(?:plan(?:es)?|cat[aá]logo|muestra|ver\s+(?:los\s+)?planes)\b/i,
  specialQuote: /\b(?:instabox|video\s*lounge|cotizaci[oó]n\s+especial|activaci[oó]n|btl)\b/i,
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchedServices(text: string) {
  return Object.entries(SERVICE_CONTEXT)
    .filter(([name]) => normalize(text).includes(normalize(name)))
    .map(([, context]) => context);
}

export interface BiancaCommercialKnowledgeInput {
  messageText: string;
  historyText?: string;
}

/** Selects the smallest useful commercial context for the current turn. */
export function selectBiancaCommercialKnowledge(input: BiancaCommercialKnowledgeInput): string {
  const text = `${input.messageText}\n${input.historyText ?? ""}`;
  const sections: string[] = [];
  const hasTotem = TOPIC_PATTERNS.totem.test(text);
  const hasFormats = TOPIC_PATTERNS.formats.test(text);
  const hasPhotoIa = TOPIC_PATTERNS.photoIa.test(text);
  const hasCatalog = TOPIC_PATTERNS.catalog.test(text);
  const hasSpecialQuote = TOPIC_PATTERNS.specialQuote.test(text);

  if (hasTotem || hasFormats) {
    sections.push([
      "TERMINOLOGÍA: tótem = un equipo/experiencia fotográfica BOOMBOX; no presentarlo como productos físicos distintos.",
      "FORMATO = resultado/configuración de fotografía; PLAN = duración + formato + prestaciones.",
      "Classic: 5 × 15 cm, 3 fotos y 2 impresiones por sesión.",
      "Polaroid: 7,5 × 10 cm y 2 impresiones por sesión; cantidad de fotos no definida, no inventarla.",
    ].join("\n"));
  }

  const services = matchedServices(text);
  if (services.length) sections.push(`SERVICIOS RELEVANTES:\n${services.join("\n")}`);

  if (hasPhotoIa) {
    sections.push([
      "PHOTO IA: oferta comercial vigente, pero SERVICE REGISTRY STATUS = NOT NORMALIZED.",
      "No crear un ServiceId ni inventar una tarifa desde memoria; para precio/configuración usar la fuente comercial autorizada o escalar a revisión Founder.",
    ].join("\n"));
  }

  if (hasSpecialQuote) {
    sections.push("COTIZACIÓN ESPECIAL: Instabox y Video Lounge requieren cotización oficial; no inventar precio ni disponibilidad.");
  }

  if (hasCatalog) {
    sections.push([
      "CATÁLOGOS: matrimonio/novios → WEDDINGS; empresa/corporativo → COMPANIES; cumpleaños/graduación/evento general → EVENTS.",
      `Links canónicos: WEDDINGS=${BIANCA_CANONICAL_CATALOG_LINKS.WEDDINGS}; COMPANIES=${BIANCA_CANONICAL_CATALOG_LINKS.COMPANIES}; EVENTS=${BIANCA_CANONICAL_CATALOG_LINKS.EVENTS}.`,
      "Para compartir planes, solicita CATALOG_LOOKUP y usa exclusivamente el link/documento retornado por ORBIT.",
    ].join("\n"));
  }

  if (!sections.length) return "SIN CONTEXTO COMERCIAL ESPECIAL: usa el catálogo y pricing canónicos solo si la intención los requiere.";
  return [
    "CONOCIMIENTO COMERCIAL CONTEXTUAL (no es fuente de precios):",
    ...sections,
    "REGLA: recursos físicos internos no son servicios comerciales; nunca mencionar IDs, inventario ni unidades disponibles.",
    "REGLA DE AUTORIDAD: precios, extras, recargos y disponibilidad vienen de la consulta comercial canónica; no calcular ni inventar.",
  ].join("\n\n");
}
