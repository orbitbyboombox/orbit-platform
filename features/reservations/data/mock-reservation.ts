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
    bank: "Banco de Chile",
    account: "Cuenta corriente · 123456789",
    rut: "76.123.456-7",
    email: "pagos@boom-box.cl",
  },
};
