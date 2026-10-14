export type CanonicalVenue = {
  code?: string;
  name: string;
  municipality: string;
  province?: string;
  aliases?: string[];
  surcharge?: number;
  enabled?: boolean;
  explanation?: string;
};

/** Normalizes accents, punctuation and spacing for venue aliases. */
export function normalizeVenueName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveCanonicalVenue(value: string, municipality: string, venues: CanonicalVenue[]) {
  const normalizedValue = normalizeVenueName(value);
  const normalizedMunicipality = normalizeVenueName(municipality);
  if (!normalizedValue || !normalizedMunicipality) return null;
  return venues.find((venue) => {
    if (venue.enabled === false || normalizeVenueName(venue.municipality) !== normalizedMunicipality) return false;
    const candidates = [venue.name, ...(venue.aliases ?? [])].map(normalizeVenueName).filter(Boolean);
    return candidates.some((candidate) => candidate === normalizedValue || (candidate.length >= 8 && (normalizedValue.includes(candidate) || candidate.includes(normalizedValue))));
  }) ?? null;
}
