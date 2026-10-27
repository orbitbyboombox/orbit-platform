import type { Money } from "@/features/business-core";

export interface PaymentPreview {
  reservationTotal: Money;
  bankDetails: {
    holder: string;
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
    holder: "PRODUCCIONES BOOMBOX COMPANY SPA",
    bank: "BCI",
    accountType: "Cuenta Corriente",
    accountNumber: "52093409",
    rut: "76.565.272-3",
    email: "contabilidad@bbox.cl",
  },
};
