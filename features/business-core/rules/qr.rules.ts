import type { CommercialValue, EventTypeId, Money } from "../types";
import { getEventType } from "../catalog";

export interface QrRule {
  included: boolean;
  price: CommercialValue<Money>;
  vatExclusive: boolean;
  requiresReview: boolean;
}

const COMPANY_QR_PRICE: Money = { amount: 75_000, currency: "CLP" };

export function getQrRule(eventType: EventTypeId): QrRule {
  const category = getEventType(eventType).category;
  if (category === "CORPORATE") return { included: false, price: { status: "DEFINED", value: COMPANY_QR_PRICE }, vatExclusive: true, requiresReview: false };
  if (category === "SOCIAL") return { included: true, price: { status: "DEFINED", value: { amount: 0, currency: "CLP" } }, vatExclusive: false, requiresReview: false };
  return { included: false, price: { status: "REQUIRES_QUOTE", value: null }, vatExclusive: false, requiresReview: true };
}

export function isQrIncluded(eventType: EventTypeId): boolean {
  return getQrRule(eventType).included;
}
