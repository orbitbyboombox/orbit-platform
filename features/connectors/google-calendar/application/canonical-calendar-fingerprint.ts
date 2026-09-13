export type CanonicalCalendarFingerprintInput = {
  orbitEventId: string | null | undefined;
  serviceStartAt: string | Date | null | undefined;
  serviceEndAt: string | Date | null | undefined;
  staffCallAt: string | Date | null | undefined;
  staffCallSource: string | null | undefined;
  location: string | null | undefined;
};

function iso(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).trim() || null : date.toISOString();
}

export function buildCanonicalCalendarFingerprint(input: CanonicalCalendarFingerprintInput): string {
  return JSON.stringify({
    orbitEventId: input.orbitEventId == null ? null : String(input.orbitEventId).trim() || null,
    serviceStartAt: iso(input.serviceStartAt),
    serviceEndAt: iso(input.serviceEndAt),
    staffCallAt: iso(input.staffCallAt),
    staffCallSource: input.staffCallSource == null ? null : String(input.staffCallSource).trim() || null,
    location: input.location == null ? null : String(input.location).trim() || null,
  });
}

export function hashCanonicalCalendarFingerprint(input: CanonicalCalendarFingerprintInput): string {
  // Deterministic non-cryptographic hash keeps this shared helper safe in client bundles.
  const value = buildCanonicalCalendarFingerprint(input);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
