import type { EventTypeId, Money, ServiceId } from "@/features/business-core";
import type { QuotationDuration, QuotationExtraId } from "@/features/business-core";

export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
export type QuotationCustomerType = "PRIVATE" | "COMPANY";
export type NegotiationMethod = "MANUAL" | "PERCENT_DISCOUNT" | "PERCENT_INCREASE" | "FIXED_DISCOUNT" | "FIXED_INCREASE" | "RESTORE";
export interface QuotationNegotiationInput { readonly quotationId: string; readonly expectedVersion: number; readonly method: NegotiationMethod; readonly value: number; readonly reason?: string; }
export interface NegotiatedPrice { readonly officialPrice: Money; readonly finalCustomerPrice: Money; readonly difference: Money; readonly discountPercentage: number; readonly increasePercentage: number; readonly modified: boolean; }
export interface QuotationServiceInput { readonly serviceId: ServiceId; readonly duration: QuotationDuration; readonly additionalHours?: number; }
export interface QuotationExtraInput { readonly extraId: QuotationExtraId; readonly quantity?: number; readonly serviceId?: ServiceId; readonly duration?: QuotationDuration; }
export interface CreateQuotationInput { readonly customerId: string; readonly projectId: string; readonly orbitEventId: string; readonly customerType: QuotationCustomerType; readonly eventType: EventTypeId; readonly destination: string; readonly services: readonly QuotationServiceInput[]; readonly extras: readonly QuotationExtraInput[]; readonly discount?: Money; readonly issueDate: string; readonly expirationDate: string; }
export interface QuotationLine { readonly code: string; readonly label: string; readonly quantity: number; readonly unitPrice: Money; readonly total: Money; }
export interface QuotationCalculation { readonly ready: boolean; readonly blockers: readonly string[]; readonly lines: readonly QuotationLine[]; readonly subtotal: Money; readonly transport: Money; readonly discount: Money; readonly taxes: Money; readonly grandTotal: Money; }
