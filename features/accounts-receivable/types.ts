import type {
  PaymentClassificationSummary,
  ReceivablePaymentCategory,
  ReceivablePaymentSource,
} from "./payment-term-classification";

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";
export type PaymentTerm =
  | "CASH"
  | "DAYS_15"
  | "DAYS_30"
  | "DAYS_45"
  | "DAYS_60"
  | "DAYS_90"
  | "CUSTOM";
export interface ReceivableInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  projectId: string;
  projectName: string;
  projectType: string;
  orbitEventId: string;
  customerType: "PRIVATE" | "CORPORATE";
  status: InvoiceStatus;
  amount: number;
  paidAmount: number;
  outstandingBalance: number;
  issueDate: string | null;
  dueDate: string | null;
  paymentTerm: PaymentTerm;
  customTermDays: number | null;
  paymentCategory: ReceivablePaymentCategory;
  paymentCategorySource: ReceivablePaymentSource;
  canonicalPaymentTerm: PaymentTerm;
  canonicalPaymentTermDays: number;
  purchaseOrder: string | null;
  daysRemaining: number | null;
  agingBucket: string;
  version: number;
  service: string;
  agreementId: string | null;
  contractAvailable: boolean;
  collectorId: string | null;
  collectorName: string;
  collectionActions: readonly { id: string; type: string; channel: string; subject: string; status: string; occurredAt: string }[];
  lastPayment: { id: string; amount: number; paidAt: string; method: string } | null;
  paymentHistory: readonly { id: string; amount: number; paidAt: string; method: string; observation: string }[];
  recordState?: "ACTIVE" | "ARCHIVED" | "CANCELLED" | "DELETED";
  recordOrigin?: "PRODUCTION" | "QA";
}
export interface ReceivableCustomer {
  id: string;
  name: string;
  totalInvoiced: number;
  outstandingBalance: number;
  overdueInvoices: number;
  averagePaymentDays: number | null;
  creditHistory: "AL_DIA" | "CON_ATRASO" | "SIN_HISTORIAL";
}
export interface ReceivableDataset {
  generatedAt: string;
  invoices: readonly ReceivableInvoice[];
  historyInvoices: readonly ReceivableInvoice[];
  customers: readonly ReceivableCustomer[];
  projects: readonly {
    id: string;
    name: string;
    orbitEventId: string;
    customerId: string;
    customerName: string;
    customerType: "PRIVATE" | "CORPORATE";
    quotationId: string | null;
    agreementId: string | null;
    amount: number;
  }[];
  metrics: {
    accountsReceivable: number;
    outstandingBalance: number;
    overdueBalance: number;
    collected: number;
    companyCredits: number;
    paymentCategorySummary: PaymentClassificationSummary;
    collectionRate: number;
    averageCollectionDays: number | null;
    aging: Record<string, number>;
  };
}
