import type { Money } from "@/features/business-core/types";

export const COMMERCIAL_DEPOSIT_RATE = 0.5;

export type CommercialQuoteStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED";

export function calculateCommercialTax(input: {
  taxableAmount: number;
  customerType: "PRIVATE" | "COMPANY";
  vatPercentage: number;
}) {
  const net = Math.max(0, Math.round(input.taxableAmount));
  const vat = input.customerType === "COMPANY"
    ? Math.round(net * (input.vatPercentage / 100))
    : 0;
  return { net, vat, total: net + vat };
}

export function calculateCommercialDeposit(total: Money): Money {
  return { amount: Math.round(total.amount * COMMERCIAL_DEPOSIT_RATE), currency: total.currency };
}

export function calculateCommercialBalance(total: Money, paid: Money): Money {
  if (total.currency !== paid.currency) throw new Error("La moneda del pago no coincide con la cotización.");
  return { amount: Math.max(0, total.amount - paid.amount), currency: total.currency };
}

export function evaluateCommercialConfirmation(input: {
  agreementSigned: boolean;
  total: number;
  paid: number;
  depositRate?: number;
}) {
  const requiredDeposit = Math.round(input.total * (input.depositRate ?? COMMERCIAL_DEPOSIT_RATE));
  const depositSatisfied = input.paid >= requiredDeposit;
  return {
    requiredDeposit,
    depositSatisfied,
    agreementSigned: input.agreementSigned,
    confirmed: input.agreementSigned && depositSatisfied,
    state: !input.agreementSigned ? "AWAITING_CONTRACT" as const : !depositSatisfied ? "AWAITING_DEPOSIT" as const : "CONFIRMED" as const,
  };
}

export function effectiveQuotationStatus(input: {
  status: CommercialQuoteStatus;
  expirationDate: string;
  today: string;
}): CommercialQuoteStatus {
  if (["ACCEPTED", "REJECTED", "CONVERTED"].includes(input.status)) return input.status;
  return input.expirationDate < input.today ? "EXPIRED" : input.status;
}

export function assertCommercialDocumentOwnership(input: {
  tokenAgreementId: string;
  requestedAgreementId: string;
}) {
  if (input.tokenAgreementId !== input.requestedAgreementId) {
    throw new Error("El enlace no pertenece a este contrato.");
  }
  return true;
}
