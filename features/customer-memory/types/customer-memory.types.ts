import type { EventTimeIntelligence } from "@/features/time-intelligence";

export type CustomerMemoryField =
  | "customerName"
  | "eventType"
  | "eventDate"
  | "eventLocation"
  | "estimatedGuests"
  | "recommendedHours"
  | "selectedService"
  | "currentTimelineStage"
  | "quotationStatus"
  | "reservationStatus"
  | "paymentStatus"
  | "portalStatus"
  | "lastConversationDate";

export type QuotationStatus = "NOT_STARTED" | "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
export type ReservationMemoryStatus = "NOT_STARTED" | "PENDING" | "WAITING_VALIDATION" | "APPROVED" | "REJECTED";
export type PaymentMemoryStatus = "NOT_STARTED" | "PENDING" | "PROOF_UPLOADED" | "WAITING_VALIDATION" | "APPROVED" | "REJECTED";
export type PortalMemoryStatus = "NOT_CREATED" | "ACTIVE" | "WAITING_CUSTOMER" | "COMPLETED" | "ARCHIVED";

export interface CustomerMemoryRecord {
  customerId: string;
  customerName?: string;
  eventType?: string;
  eventDate?: string;
  eventLocation?: string;
  estimatedGuests?: number;
  recommendedHours?: number;
  selectedService?: string;
  currentTimelineStage?: string;
  quotationStatus?: QuotationStatus;
  reservationStatus?: ReservationMemoryStatus;
  paymentStatus?: PaymentMemoryStatus;
  portalStatus?: PortalMemoryStatus;
  lastConversationDate?: string;
  confirmedFields: readonly CustomerMemoryField[];
}

export type CustomerMemoryPatch = Partial<Omit<CustomerMemoryRecord, "customerId" | "confirmedFields">>;

export interface ConfirmedMemoryUpdate {
  values: CustomerMemoryPatch;
  confirmedFields: readonly CustomerMemoryField[];
}

export interface CustomerTimelineContext {
  daysRemaining: number;
  countdownLabel: string;
  currentOperationalPhase: string;
  nextRecommendedAction: string;
  intelligence: EventTimeIntelligence;
}

export interface CustomerConversationContext {
  customerId: string;
  customerName?: string;
  knownInformation: Readonly<Partial<Omit<CustomerMemoryRecord, "customerId" | "confirmedFields">>>;
  confirmedInformation: readonly CustomerMemoryField[];
  missingInformation: readonly CustomerMemoryField[];
  nextQuestion?: string;
  timeline?: CustomerTimelineContext;
  quotationStatus: QuotationStatus;
  reservationStatus: ReservationMemoryStatus;
  paymentStatus: PaymentMemoryStatus;
  portalStatus: PortalMemoryStatus;
  isConversationReady: boolean;
}

export type MemoryConflictCode = "CONFIRMED_VALUE_CONFLICT" | "INVALID_CONFIRMED_FIELD";

export interface MemoryConflict {
  code: MemoryConflictCode;
  field: CustomerMemoryField;
  currentValue?: unknown;
  attemptedValue?: unknown;
}

export type MemoryUpdateResult =
  | { ok: true; memory: CustomerMemoryRecord }
  | { ok: false; memory: CustomerMemoryRecord; conflict: MemoryConflict };
