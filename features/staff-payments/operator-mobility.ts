/**
 * Operator self-transport allowance. This is a staff COST, not customer transport revenue.
 * Pure policy module: it does not persist, assign, or pay anything.
 * Effective for events occurring on or after 2026-10-17 (Chile local date).
 */
export const OPERATOR_MOBILITY_EFFECTIVE_DATE = "2026-10-17";

/** Verified production staff identities; only these exact IDs are excluded. */
export const EXCLUDED_OPERATOR_MOBILITY_STAFF_IDS: ReadonlySet<string> = new Set([
  "07683338-3ff1-4235-9253-1efeeed4a7c1", // Sebastian Jorquera
  "353b9538-7d1c-4048-b71f-17854bde78ce", // Fernando Figueroa
  "bd31d438-42fc-474a-87b6-a5f68f626fea", // Jose Rodriguez
]);

export function uniqueOperatorEventMobilityKey(projectId: string, staffId: string): string {
  return `${projectId}:${staffId}`;
}

const priceByCommune = new Map<string, number>([
  ...["lampa", "colina", "batuco", "pirque", "san jose de maipo", "san bernardo", "buin", "calera de tango", "paine"].map((name) => [name, 12_000] as const),
  ...["melipilla", "curacavi", "talagante", "el monte", "isla de maipo", "penaflor", "padre hurtado"].map((name) => [name, 17_000] as const),
]);

export function normalizeMobilityCommune(commune: string): string {
  return commune.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-CL").replace(/\s+/g, " ");
}

export function suggestedOperatorMobilityAmount(commune: string | null | undefined): number | null {
  return commune ? (priceByCommune.get(normalizeMobilityCommune(commune)) ?? null) : null;
}

export function operatorMobilityEligibility(input: {
  eventDate: string | null | undefined;
  role: string;
  staffId: string;
  excludedStaffIds: ReadonlySet<string>;
  commune: string | null | undefined;
}): { eligible: boolean; suggestedAmount: number | null; reason?: string } {
  // Only the YYYY-MM-DD Chile-local date is accepted; do not infer from UTC.
  if (!input.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) || input.eventDate < OPERATOR_MOBILITY_EFFECTIVE_DATE) {
    return { eligible: false, suggestedAmount: null, reason: "OUTSIDE_EFFECTIVE_DATE" };
  }
  if (input.role !== "OPERATOR") return { eligible: false, suggestedAmount: null, reason: "NOT_OPERATOR" };
  if (input.excludedStaffIds.has(input.staffId)) return { eligible: false, suggestedAmount: null, reason: "EXCLUDED_STAFF" };
  const suggestedAmount = suggestedOperatorMobilityAmount(input.commune);
  if (suggestedAmount === null) return { eligible: false, suggestedAmount: null, reason: "COMMUNE_REVIEW_REQUIRED" };
  return { eligible: true, suggestedAmount };
}

/** An eligible suggestion is NEVER an authorization to pay. */
export function resolveApprovedOperatorMobility(input: {
  eligible: boolean;
  suggestedAmount: number | null;
  approvedByFounder: boolean;
  travelsIndependently: boolean;
}): number {
  if (!input.eligible || !input.approvedByFounder || !input.travelsIndependently) return 0;
  return input.suggestedAmount === 12_000 || input.suggestedAmount === 17_000 ? input.suggestedAmount : 0;
}
