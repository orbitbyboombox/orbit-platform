export type D10CollectionEligibility =
  | "ELIGIBLE"
  | "PAID"
  | "NOT_DUE_BEFORE_EVENT"
  | "MISSING_DUE_DATE"
  | "INVALID_BALANCE"
  | "MISSING_RECIPIENT"
  | "CANCELLED";

/**
 * A D-10 collection is only valid when the obligation is payable on or before
 * the event. A balance alone is not evidence that it is currently collectible.
 */
export function resolveD10CollectionEligibility(input: {
  eventDate: string | null | undefined;
  dueDate: string | null | undefined;
  outstandingBalance: number;
  recipient: string | null | undefined;
  status?: string | null;
}): { eligible: boolean; reason: D10CollectionEligibility } {
  const status = String(input.status ?? "").toUpperCase();
  if (["CANCELLED", "CANCELED", "ARCHIVED", "DELETED", "VOID", "REJECTED"].includes(status)) {
    return { eligible: false, reason: "CANCELLED" };
  }
  if (!Number.isFinite(input.outstandingBalance) || input.outstandingBalance < 0) {
    return { eligible: false, reason: "INVALID_BALANCE" };
  }
  if (input.outstandingBalance === 0) return { eligible: false, reason: "PAID" };
  if (!input.dueDate) return { eligible: false, reason: "MISSING_DUE_DATE" };
  if (input.eventDate && input.dueDate > input.eventDate) {
    return { eligible: false, reason: "NOT_DUE_BEFORE_EVENT" };
  }
  if (!input.recipient?.trim()) return { eligible: false, reason: "MISSING_RECIPIENT" };
  return { eligible: true, reason: "ELIGIBLE" };
}
