export const BIANCA_COMMERCIAL_STAGES = [
  "NEW_LEAD",
  "QUALIFYING",
  "CATALOG_SENT",
  "PRICING_READY",
  "QUOTING",
  "QUOTE_SENT",
  "RESERVATION_INTENT",
  "RESERVATION_STARTED",
  "FOLLOW_UP",
  "HUMAN_REQUIRED",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export type BiancaCommercialStage = (typeof BIANCA_COMMERCIAL_STAGES)[number];

export const BIANCA_INTENTS = [
  "GREETING", "IDENTITY", "NEW_QUOTE", "CONTINUE_QUOTE", "ASK_SERVICE",
  "ASK_FORMAT", "ASK_PLAN", "ASK_PRICE", "COMPARE_PLANS", "ASK_AVAILABILITY",
  "ASK_CATALOG", "ASK_EXTRAS", "ASK_COMMUNE", "ASK_SPECIAL_VENUE", "ASK_PAYMENT",
  "ASK_RESERVATION", "RESERVATION_INTENT", "REQUEST_EMAIL", "MULTI_SERVICE", "PRICE_OBJECTION",
  "DISCOUNT_REQUEST", "TECHNICAL_QUESTION", "WEB_FORM_LEAD", "RETURNING_CUSTOMER",
  "FOLLOW_UP", "COMPLAINT", "HUMAN_REQUEST", "UNKNOWN",
] as const;

export type BiancaIntent = (typeof BIANCA_INTENTS)[number];

export type BiancaNextAction =
  | "ASK_NAME" | "ASK_DATE" | "CONFIRM_YEAR" | "ASK_COMMUNE" | "ASK_VENUE"
  | "CATALOG_LOOKUP" | "PRICE_LOOKUP" | "AVAILABILITY_LOOKUP" | "OFFER_QUOTE"
  | "OFFER_RESERVATION" | "FIND_ALTERNATIVE" | "HANDOFF" | "WAIT_FOR_CUSTOMER";

export interface BiancaKnownOpportunity {
  preferredName?: string;
  eventType?: string;
  eventDate?: string;
  commune?: string;
  venue?: string;
  serviceCodes?: readonly string[];
  durationHours?: number;
  priceResolved?: boolean;
  availability?: "AVAILABLE" | "UNAVAILABLE";
  highIntent?: boolean;
}

export interface BiancaActionPlan {
  commercialStage: BiancaCommercialStage;
  intent: BiancaIntent;
  intents: BiancaIntent[];
  leadIntent: "LOW" | "MEDIUM" | "HIGH";
  missing: string[];
  nextBestAction: BiancaNextAction;
}
