import type { Money } from "@/features/business-core";

export interface PaymentPreview {
  reservationTotal: Money;
  bankDetails: {
    bank: string;
    accountType: string;
    accountNumber: string;
    rut: string;
    email: string;
  };
}

export const MOCK_PAYMENT: PaymentPreview = {
  reservationTotal: { amount: 1_000_000, currency: "CLP" },
  bankDetails: {
    bank: "Banco de Chile",
    accountType: "Cuenta corriente",
    accountNumber: "123456789",
    rut: "76.123.456-7",
    email: "pagos@boom-box.cl",
  },
};
