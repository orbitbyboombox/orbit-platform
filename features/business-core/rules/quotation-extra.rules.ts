import type { CommercialValue, EventTypeId, Money } from "../types";

export type QuotationExtraId = "UNLIMITED_MAGNETS" | "QR" | "BRANDING" | "SCRAPBOOK" | "ADDITIONAL_HOUR" | "ADDITIONAL_TRANSPORT" | "ADDITIONAL_OPERATOR" | "ADDITIONAL_PRINTING";
export interface QuotationExtraRule { readonly id: QuotationExtraId; readonly label: string; readonly price: CommercialValue<Money>; readonly included?: boolean; readonly vatExclusive?: boolean; readonly minimumQuantity?: number; }

const clp = (amount: number): CommercialValue<Money> => ({ status: "DEFINED", value: { amount, currency: "CLP" } });
const requiresQuote: CommercialValue<Money> = { status: "REQUIRES_QUOTE", value: null };

const common: Readonly<Record<QuotationExtraId, QuotationExtraRule>> = {
  UNLIMITED_MAGNETS: { id: "UNLIMITED_MAGNETS", label: "Imanes ilimitados", price: clp(65_000) },
  QR: { id: "QR", label: "QR corporativo", price: clp(75_000), vatExclusive: true },
  BRANDING: { id: "BRANDING", label: "Branding", price: clp(75_000), vatExclusive: true, minimumQuantity: 2 },
  SCRAPBOOK: { id: "SCRAPBOOK", label: "Scrapbook", price: clp(50_000) },
  ADDITIONAL_HOUR: { id: "ADDITIONAL_HOUR", label: "Hora adicional", price: requiresQuote },
  ADDITIONAL_TRANSPORT: { id: "ADDITIONAL_TRANSPORT", label: "Traslado adicional", price: requiresQuote },
  ADDITIONAL_OPERATOR: { id: "ADDITIONAL_OPERATOR", label: "Operador adicional", price: requiresQuote },
  ADDITIONAL_PRINTING: { id: "ADDITIONAL_PRINTING", label: "Impresión adicional", price: requiresQuote },
};

export function getQuotationExtras(eventType: EventTypeId): readonly QuotationExtraRule[] {
  const includedQr = { ...common.QR, included: true, price: clp(0) };
  if (eventType === "WEDDING") return [{ ...common.SCRAPBOOK, included: true, price: clp(0) }, includedQr, common.UNLIMITED_MAGNETS, common.ADDITIONAL_HOUR, common.ADDITIONAL_TRANSPORT];
  if (eventType === "BIRTHDAY" || eventType === "GRADUATION") return [includedQr, common.UNLIMITED_MAGNETS, common.SCRAPBOOK, common.ADDITIONAL_HOUR, common.ADDITIONAL_TRANSPORT];
  if (eventType === "COMPANY" || eventType === "PUBLIC_EVENT") return [common.BRANDING, common.QR, common.SCRAPBOOK, common.UNLIMITED_MAGNETS, common.ADDITIONAL_HOUR, common.ADDITIONAL_TRANSPORT];
  return [common.UNLIMITED_MAGNETS, common.ADDITIONAL_HOUR, common.ADDITIONAL_TRANSPORT];
}

export const QUOTATION_EXTRA_RULES = common;
