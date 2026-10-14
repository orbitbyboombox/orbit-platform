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
  lineItems: OfficeLeaseIncomeItem[];
}

export type OfficeLeaseIncomeType = "RENT" | "SECURITY_DEPOSIT";

export interface OfficeLeaseIncomeItem {
  id: string;
  paymentId: string;
  obligationId: string;
  itemType: OfficeLeaseIncomeType;
  description: string;
  detail: string;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  sortOrder: number;
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
  guaranteeAmount: number;
  cashReceivedAmount: number;
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
  yearGuaranteeReceived: number;
  yearCashReceived: number;
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
  today: string;
}

export const formatClp = (value: number) =>
  `$${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

export const receiptLabel = (receiptNumber: number) =>
  `N°${String(receiptNumber).padStart(3, "0")}`;

export const monthLabel = (period: string) => {
  const [year, month] = period.slice(0, 7).split("-");
  const monthName = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ][Number(month) - 1] ?? "Mes";
  return `${monthName} de ${year}`;
};

export const formatOfficeDate = (value: string | null) => {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.slice(0, 10).split("-");
  const monthName = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"][Number(month) - 1] ?? "mes";
  return `${day} ${monthName} ${year}`;
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
    yearGuaranteeReceived: months
      .filter((month) => month.period.startsWith(year))
      .reduce((sum, month) => sum + month.guaranteeAmount, 0),
    yearCashReceived: months
      .filter((month) => month.period.startsWith(year))
      .reduce((sum, month) => sum + month.cashReceivedAmount, 0),
    paidMonths: months.filter((month) => month.status === "PAID").length,
    pendingMonths: months.filter((month) => month.status !== "PAID").length,
    grossOfficeCost,
    contractedRent: settings.monthlyAmount,
    netContractCost: grossOfficeCost - settings.monthlyAmount,
  };
}
