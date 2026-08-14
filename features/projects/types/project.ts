export const projectTypes = [
  "Wedding",
  "Corporate",
  "Birthday",
  "Graduation",
  "Private",
  "Other",
] as const;
export const projectStatuses = [
  "Active",
  "Upcoming",
  "Completed",
  "Archived",
] as const;
export const projectHealthLevels = [
  "Healthy",
  "Attention",
  "Risk",
  "Critical",
] as const;
export const projectCommercialStages = [
  "New",
  "Contacted",
  "Quoting",
  "Waiting",
  "Reserved",
  "Confirmed",
  "Production",
  "Finished",
] as const;
export const projectOrigins = [
  "WhatsApp",
  "Instagram",
  "Google",
  "Website",
  "Referral",
  "FormerClient",
  "Other",
] as const;

export type ProjectType = (typeof projectTypes)[number];
export type ProjectService = string;
export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectHealth = (typeof projectHealthLevels)[number];
export type ProjectCommercialStage = (typeof projectCommercialStages)[number];
export type ProjectOrigin = (typeof projectOrigins)[number];
export type ProjectFilter = "All" | ProjectCommercialStage;

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  client: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    rut?: string;
    address?: string;
  };
  event: {
    date: string;
    time: string;
    location: string;
    city: string;
    durationHours?: number;
    extras?: string[];
  };
  services: ProjectService[];
  status: ProjectStatus;
  health: ProjectHealth;
  stage?: string;
  score?: number;
  commercialStage: ProjectCommercialStage;
  origin?: ProjectOrigin;
  notes?: string;
  customerVersion?: number;
  lastCommunication?: string;
  salesOwner?: string;
  nextAction?: string;
  tags?: string[];
  reservationTransactionId?: string;
  reservationResumed?: boolean;
}

export interface ProjectDraft {
  commercialSourceQuotationId?: string;
  reservationTransactionId?: string;
  crmCustomerId?: string;
  type?: ProjectType;
  client: Project["client"];
  event: Project["event"];
  services: ProjectService[];
  origin?: ProjectOrigin;
  notes: string;
  commercialFormalization?: {
    type:
      | "CONTRACT_INVOICE"
      | "INVOICE_ONLY"
      | "PURCHASE_ORDER"
      | "BOOMBOX_AGREEMENT"
      | "NO_CONTRACT";
    requiresSignature: boolean;
    documentType: "SIGNED_CONTRACT" | "COMMERCIAL_DOCUMENT";
    signatureDataUrl?: string;
  };
  commercialAdjustment?: {
    type: "COMMERCIAL_NEGOTIATION";
    mode: "OFFICIAL" | "NEGOTIATED";
    value: number;
    reason: string;
    internalNotes?: string;
    subtotal: number;
    officialTotal: number;
    officialServicePrice: number;
    officialExtras: number;
    officialTransport: number;
    officialVenueSurcharge: number;
    negotiatedServicePrice: number;
    negotiatedExtras: number;
    negotiatedTransport: number;
    negotiatedTotal: number;
    difference: number;
    differencePercentage: number;
    discountAmount: number;
    discountReason:
      | "FREQUENT_CUSTOMER"
      | "CORPORATE_AGREEMENT"
      | "PROMOTION"
      | "COURTESY"
      | "FOUNDER_APPROVAL"
      | "OTHER";
    discountReasonDetail?: string;
    commercialCharge: number;
    commercialChargeDescription?: string;
    appliedTransport: number;
    courtesyValue: number;
    courtesies: Array<{
      code: "QR" | "SCRAPBOOK" | "MAGNETS" | "TRANSPORT" | "EXTRA_HOUR";
      label: string;
      officialValue: number;
      appliedValue: 0;
      reason: "Beneficio BOOMBOX";
    }>;
    paymentCondition: "FIFTY_FIFTY" | "CASH" | "CORPORATE_CREDIT";
    paymentTermDays: number;
    paymentReceiptRequired: boolean;
    corporateCreditApproved: boolean;
    corporateVatApplied: boolean;
    netAmount: number;
    vatAmount: number;
    finalPrice: number;
  };
}
