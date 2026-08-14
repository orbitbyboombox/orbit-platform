export type ReservationEventType = "Wedding" | "Corporate" | "Birthday" | "Graduation" | "Private" | "Other";
export type ReservationExtra = "Branding" | "QR" | "Imanes" | "Scrapbook";

export function filterExtrasForEventType(
  eventType: ReservationEventType | "",
  extras: readonly ReservationExtra[],
) {
  return extras.filter(
    (extra) => !(eventType === "Corporate" && extra === "Scrapbook"),
  );
}

export function includedExtrasForEventType(eventType: ReservationEventType | "") {
  if (eventType === "Wedding") return ["QR", "Scrapbook"] as ReservationExtra[];
  if (eventType === "Birthday" || eventType === "Graduation") return ["QR"] as ReservationExtra[];
  return [] as ReservationExtra[];
}

export function resolveBrandingMinimum(configured: unknown) {
  const value = Number(configured ?? 1);
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}
