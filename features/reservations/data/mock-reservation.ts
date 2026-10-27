export interface ReservationPreview {
  total: string;
  requiredDeposit: string;
  remainingBalance: string;
  bankDetails: {
    bank: string;
    account: string;
    rut: string;
    email: string;
  };
}

export const MOCK_RESERVATION: ReservationPreview = {
  total: "$780.000",
  requiredDeposit: "$234.000",
  remainingBalance: "$546.000",
  bankDetails: {
    bank: "BCI",
    account: "Cuenta Corriente · 52093409",
    rut: "76.565.272-3",
    email: "contabilidad@bbox.cl",
  },
};
