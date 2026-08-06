import type { EventTypeId, Money, ServiceId } from "@/features/business-core";
import type { QuotationDuration, QuotationExtraId } from "@/features/business-core";

export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
export type QuotationCustomerType = "PRIVATE" | "COMPANY";
export interface QuotationServiceInput { readonly serviceId: ServiceId; readonly duration: QuotationDuration; readonly additionalHours?: number; }
export interface QuotationExtraInput { readonly extraId: QuotationExtraId; readonly quantity?: number; readonly serviceId?: ServiceId; readonly duration?: QuotationDuration; }
export interface CreateQuotationInput { readonly customerId: string; readonly projectId: string; readonly orbitEventId: string; readonly customerType: QuotationCustomerType; readonly eventType: EventTypeId; readonly destination: string; readonly services: readonly QuotationServiceInput[]; readonly extras: readonly QuotationExtraInput[]; readonly discount?: Money; readonly issueDate: string; readonly expirationDate: string; }
export interface QuotationLine { readonly code: string; readonly label: string; readonly quantity: number; readonly unitPrice: Money; readonly total: Money; }
export interface QuotationCalculation { readonly ready: boolean; readonly blockers: readonly string[]; readonly lines: readonly QuotationLine[]; readonly subtotal: Money; readonly transport: Money; readonly discount: Money; readonly taxes: Money; readonly grandTotal: Money; }
