import type {
  BrandingRule,
  EventTypeId,
  PriceBreakdown,
  QrRule,
  TransportRate,
  VatDecision,
} from "@/features/business-core";

export type ContractType = "SOCIAL" | "CORPORATE";

export type ContractClauseId =
  | "COMMERCIAL"
  | "PAYMENTS"
  | "CANCELLATION"
  | "FORCE_MAJEURE"
  | "IMAGE_AUTHORIZATION"
  | "CUSTOMER_RESPONSIBILITIES"
  | "BOOMBOX_RESPONSIBILITIES";

export type ContractClauseCategory =
  | "COMMERCIAL"
  | "FINANCIAL"
  | "LEGAL"
  | "RESPONSIBILITIES";

export interface ContractParty {
  name: string;
  identifier: string;
  email: string;
  phone?: string;
  companyName?: string;
}

export interface ContractEvent {
  eventType: EventTypeId;
  date: string;
  time: string;
  venue: string;
  city: string;
}

export interface ContractBuildInput {
  projectId: string;
  contractId: string;
  issuedOn: string;
  customer: ContractParty;
  event: ContractEvent;
  serviceSummary: string;
  priceBreakdown: PriceBreakdown;
  transportRateId?: string;
  invoiceRequested?: boolean;
}

export interface ContractCommercialRules {
  vat: VatDecision;
  vatLabel: string;
  qr: QrRule;
  branding: BrandingRule;
  transportRate: TransportRate | null;
}

export interface ContractClause {
  id: ContractClauseId;
  category: ContractClauseCategory;
  title: string;
  content: string;
}

export interface ContractTemplate {
  type: ContractType;
  name: string;
  applicableEventTypes: readonly EventTypeId[];
  clauseIds: readonly ContractClauseId[];
}

export interface ContractDocument {
  id: string;
  projectId: string;
  issuedOn: string;
  type: ContractType;
  templateName: string;
  customer: ContractParty;
  event: ContractEvent;
  serviceSummary: string;
  priceBreakdown: PriceBreakdown;
  commercialRules: ContractCommercialRules;
  clauses: readonly ContractClause[];
}

export type ContractBuildError =
  | {
      code: "UNSUPPORTED_EVENT_TYPE";
      eventType: EventTypeId;
      message: string;
    }
  | {
      code: "TRANSPORT_RATE_NOT_FOUND";
      transportRateId: string;
      message: string;
    };

export type ContractBuildResult =
  | { success: true; contract: ContractDocument }
  | { success: false; error: ContractBuildError };

export interface ContractClauseContext {
  input: ContractBuildInput;
  contractType: ContractType;
  commercialRules: ContractCommercialRules;
}

export type ContractClauseFactory = (context: ContractClauseContext) => ContractClause;
