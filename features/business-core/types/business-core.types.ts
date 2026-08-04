export type Currency = "CLP";

export interface Money {
  amount: number;
  currency: Currency;
}

export type EventTypeId =
  | "COMPANY"
  | "WEDDING"
  | "BIRTHDAY"
  | "GRADUATION"
  | "PARTY"
  | "OTHER";

export type ServiceId =
  | "CLASSIC"
  | "POLAROID"
  | "BLACK_STUDIO"
  | "BBOX360"
  | "LIGHTBOX"
  | "BOOMBALL"
  | "HASHTAG";

export type DurationHours = 2 | 3 | 4 | 5;
export type DurationMode = "SELECTABLE" | "FIXED" | "SINGLE_SERVICE";

export interface DurationRule {
  mode: DurationMode;
  availableHours: readonly DurationHours[];
  fixedHours?: DurationHours;
  shouldRequestDuration: boolean;
}

export type CommercialValue<T> =
  | { status: "DEFINED"; value: T }
  | { status: "REQUIRES_QUOTE"; value: null };

export type VatMode = "EXCLUSIVE" | "INCLUDED" | "CONDITIONAL" | "REQUIRES_REVIEW";

export interface VatRule {
  eventType: EventTypeId;
  mode: VatMode;
  rate: number;
  invoiceRequestedAppliesVat: boolean;
  label: string;
}

export interface VatDecision {
  applyVat: boolean;
  mentionVatSeparately: boolean;
  mode: VatMode;
  rate: number;
  requiresReview: boolean;
}

export interface ServiceCatalogItem {
  id: ServiceId;
  name: string;
  duration: DurationRule;
}

export interface EventTypeCatalogItem {
  id: EventTypeId;
  name: string;
  category: "CORPORATE" | "SOCIAL" | "OTHER";
}

export interface TransportRate {
  id: string;
  origin: string;
  destination: string;
  price: CommercialValue<Money>;
  notes?: string;
}

export interface PricingLine {
  id: string;
  label: string;
  quantity: number;
  unitPrice: Money;
}

export interface PricingInput {
  basePrice: Money;
  extras?: readonly PricingLine[];
  transport?: Money;
  branding?: Money;
  qr?: Money;
  discount?: Money;
  vatDecision: VatDecision;
  estimatedCost?: Money;
}

export interface PriceBreakdown {
  basePrice: Money;
  extras: Money;
  transport: Money;
  branding: Money;
  qr: Money;
  discount: Money;
  netBeforeVat: Money;
  iva: Money;
  finalTotal: Money;
  estimatedMargin: CommercialValue<Money>;
}
