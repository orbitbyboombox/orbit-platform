export type OfficeLeaseStatus = "PENDING" | "PAID" | "OVERDUE";

export interface OfficeLeaseSettings {
  id: string;
  tenantLegalName: string;
  tenantRut: string;
  tenantAddress: string;
  tenantEmail: string;
  tenantPhone: string;
  tenantRepresentative: string;
  contractStartDate: string;
  contractEndDate: string;
  observations: string;
  unitName: string;
  propertyAddress: string;
  concept: string;
  monthlyAmount: number;
  commonExpensesIncluded: boolean;
  dueDay: number;
  mortgageCost: number;
  commonExpensesCost: number;
  version: number;
}

export interface OfficeLeasePayment {
  id: string;
  obligationId: string;
  amount: number;
  paidOn: string;
  paymentMethod: string;
  observation: string;
  receiptNumber: number;
  createdAt: string;
}

export interface OfficeLeaseDocument {
  id: string;
  obligationId: string | null;
  paymentId: string | null;
  documentType: "CONTRACT" | "PAYMENT_PROOF" | "INCOME_RECEIPT" | "ADDITIONAL";
  originalFilename: string;
  mimeType: string;
  createdAt: string;
}

export interface OfficeLeaseMonth {
  id: string;
  period: string;
  dueDate: string;
  amountDue: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: OfficeLeaseStatus;
  payments: OfficeLeasePayment[];
}

export interface OfficeLeaseMetrics {
  currentStatus: OfficeLeaseStatus;
  currentReceived: number;
  currentOutstanding: number;
  nextDueDate: string | null;
  yearReceived: number;
  paidMonths: number;
  pendingMonths: number;
  grossOfficeCost: number;
  contractedRent: number;
  netContractCost: number;
}

export interface OfficeLeaseDataset {
  settings: OfficeLeaseSettings;
  months: OfficeLeaseMonth[];
  documents: OfficeLeaseDocument[];
  metrics: OfficeLeaseMetrics;
  currentPeriod: string;
}

export const formatClp = (value: number) =>
  `$${Math.round(value).toLocaleString("es-CL")}`;

export const receiptLabel = (receiptNumber: number) =>
  `N°${String(receiptNumber).padStart(3, "0")}`;

export const monthLabel = (period: string) => {
  const value = new Date(`${period.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export function buildOfficeLeaseMetrics(
  settings: OfficeLeaseSettings,
  months: OfficeLeaseMonth[],
  today: string,
): OfficeLeaseMetrics {
  const currentPeriod = `${today.slice(0, 7)}-01`;
  const current = months.find((month) => month.period === currentPeriod);
  const year = today.slice(0, 4);
  const next = months
    .filter((month) => month.outstandingAmount > 0 && month.dueDate >= today)
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const grossOfficeCost = settings.mortgageCost + settings.commonExpensesCost;
  return {
    currentStatus: current?.status ?? "PENDING",
    currentReceived: current?.receivedAmount ?? 0,
    currentOutstanding: current?.outstandingAmount ?? settings.monthlyAmount,
    nextDueDate: next?.dueDate ?? null,
    yearReceived: months
      .filter((month) => month.period.startsWith(year))
      .reduce((sum, month) => sum + month.receivedAmount, 0),
    paidMonths: months.filter((month) => month.status === "PAID").length,
    pendingMonths: months.filter((month) => month.status !== "PAID").length,
    grossOfficeCost,
    contractedRent: settings.monthlyAmount,
    netContractCost: grossOfficeCost - settings.monthlyAmount,
  };
}
