import type { BrandingRule, QrRule } from "@/features/business-core/rules";
import type { EventTypeId, TransportRate, VatDecision } from "@/features/business-core/types";

export type SalesFlowType = "SOCIAL" | "CORPORATE";

export type SalesTimelineStage =
  | "COMMERCIAL_OPPORTUNITY"
  | "QUOTATION"
  | "ACCEPTED"
  | "CUSTOMER_ONBOARDING"
  | "CONFIRMED"
  | "PREPARATION"
  | "LIVE_EVENT"
  | "DELIVERY";

export interface SalesTimelineItem {
  id: SalesTimelineStage;
  label: string;
}

export interface SalesFlowDefinition {
  type: SalesFlowType;
  eventType: EventTypeId;
  name: string;
  recommendation: string;
  actionLabel: string;
  formalQuotation: boolean;
  officialCatalogRequired: boolean;
  transportInformationRequired: boolean;
  vat: VatDecision;
  qr: QrRule;
  branding: BrandingRule;
  transportRates: readonly TransportRate[];
  timeline: readonly SalesTimelineItem[];
}

export type SalesFlowError = {
  code: "UNSUPPORTED_EVENT_TYPE";
  eventType: EventTypeId;
  message: string;
};

export type SalesFlowResult =
  | { success: true; flow: SalesFlowDefinition }
  | { success: false; error: SalesFlowError };
