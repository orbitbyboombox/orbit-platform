export type CommercialCategory =
  | "WEDDINGS"
  | "BIRTHDAYS"
  | "GRADUATIONS"
  | "COMPANIES_CATALOG"
  | "COMPANIES_QUOTE";
export type DiscountType = "CLP" | "PERCENT";

export interface CommercialCustomerOption {
  id: string;
  name: string;
  company: string;
  rut: string;
  email: string;
  secondaryEmail: string;
  phone: string;
  address: string;
}
export interface CommercialCatalogItem {
  code: string;
  label: string;
  category: string;
  unitPrice: number | null;
}
export interface CommercialTemplate {
  id: string;
  category: CommercialCategory;
  subject: string;
  body: string;
}
export interface CommercialDocument {
  id: string;
  name: string;
  category: string;
  version: string;
  filename: string;
  status: "PENDING" | "ACTIVE" | "ARCHIVED";
  uploadedAt?: string;
}
export interface RecentCommercialQuote {
  id: string;
  number: string;
  customer: string;
  total: number;
  status: string;
  issuedAt: string;
  projectId: string | null;
  draft?: FormalQuoteDraft;
}
export interface CommercialHubData {
  company: { legalName: string; taxId: string; address: string; city: string; phone: string; website: string; email: string; bankName: string; bankAccountType: string; bankAccountNumber: string; reservationConditions: string[]; emailSignatureUrl: string };
  customers: CommercialCustomerOption[];
  catalog: CommercialCatalogItem[];
  templates: CommercialTemplate[];
  documents: CommercialDocument[];
  recentQuotes: RecentCommercialQuote[];
  recentSends: Array<{ id: string; recipient: string; ccRecipients: string[]; category: string; subject: string; status: string; sentAt: string; providerMessageId: string | null; quotationId: string | null; projectId: string | null; customerId: string | null }>;
}

export interface QuoteLineDraft {
  id: string;
  code: string;
  description: string;
  quantity: number;
  catalogPrice: number | null;
  quotedPrice: number;
  discountType: DiscountType | null;
  discountValue: number;
  manual: boolean;
}
export interface FormalQuoteDraft {
  quoteId?: string;
  requestId?: string;
  existingCustomerId: string | null;
  saveTemporaryCustomer: boolean;
  company: string;
  rut: string;
  contact: string;
  email: string;
  secondaryEmail?: string;
  phone: string;
  address: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventCity: string;
  validityDays: number;
  depositPercent: number;
  globalDiscountType: DiscountType | null;
  globalDiscountValue: number;
  attachCatalog: boolean;
  lines: QuoteLineDraft[];
}
