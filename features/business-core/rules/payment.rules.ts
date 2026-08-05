import type { Money } from "../types";

export type PaymentMethodId = "BANK_TRANSFER" | "MERCADO_PAGO" | "FLOW";

export interface PaymentMethodRule {
  id: PaymentMethodId;
  name: string;
  processingRate: number;
  availability: "AVAILABLE" | "FUTURE";
  primary: boolean;
}

export interface PaymentAmountBreakdown {
  baseAmount: Money;
  processingCharge: Money;
  totalToPay: Money;
}

export const RESERVATION_DEPOSIT_RATE = 0.5;

export const PAYMENT_METHOD_RULES: Readonly<Record<PaymentMethodId, PaymentMethodRule>> = {
  BANK_TRANSFER: {
    id: "BANK_TRANSFER",
    name: "Transferencia bancaria",
    processingRate: 0,
    availability: "AVAILABLE",
    primary: true,
  },
  MERCADO_PAGO: {
    id: "MERCADO_PAGO",
    name: "Mercado Pago",
    processingRate: 0.05,
    availability: "AVAILABLE",
    primary: false,
  },
  FLOW: {
    id: "FLOW",
    name: "Flow",
    processingRate: 0.05,
    availability: "FUTURE",
    primary: false,
  },
};

export function getPaymentMethodRule(method: PaymentMethodId): PaymentMethodRule {
  return PAYMENT_METHOD_RULES[method];
}

export function calculateReservationDeposit(total: Money): Money {
  return { amount: Math.round(total.amount * RESERVATION_DEPOSIT_RATE), currency: total.currency };
}

export function calculatePaymentAmount(baseAmount: Money, method: PaymentMethodId): PaymentAmountBreakdown {
  const rule = getPaymentMethodRule(method);
  const processingCharge = Math.round(baseAmount.amount * rule.processingRate);

  return {
    baseAmount,
    processingCharge: { amount: processingCharge, currency: baseAmount.currency },
    totalToPay: { amount: baseAmount.amount + processingCharge, currency: baseAmount.currency },
  };
}
