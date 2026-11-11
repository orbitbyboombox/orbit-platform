import type { StaffMonthlyAccount } from "./model";

export type PaymentModality = "QUINCENAL" | "MENSUAL";
export type PaymentPeriodCode = "Q1" | "Q2" | "MONTH";
export type StaffPaymentPeriod = {
  id: string;
  account_id: string;
  period_code: PaymentPeriodCode;
  starts_on: string;
  ends_on: string;
  status: "DRAFT" | "FINALIZED";
  snapshot: Record<string, unknown> | null;
  closed_at: string | null;
};
export type StaffPeriodPayment = {
  id: string;
  period_id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
  receipt_document_id: string;
  created_at: string;
};
export type PaymentSchedule = {
  account_id: string;
  modality: PaymentModality;
  monthly_boleta_validation: string | null;
};
export type StaffPeriodPreview = StaffPaymentPeriod & {
  calculation: Record<string, unknown>;
  paidAmount: number;
  remaining: number;
};
export const periodLabel = (code: PaymentPeriodCode) =>
  ({
    Q1: "Primera quincena · 01 al 14",
    Q2: "Segunda quincena · 15 a fin de mes",
    MONTH: "Mensual · 01 a fin de mes",
  })[code];

/** Adapt a period snapshot to the existing PDF renderer, preserving every detail. */
export function periodPdfAccount(
  account: StaffMonthlyAccount,
  preview: StaffPeriodPreview,
): StaffMonthlyAccount {
  const calc = preview.calculation;
  return {
    ...account,
    workNet: Number(calc.workNet ?? 0),
    boletaGross: Number(calc.boletaGross ?? 0),
    boletaNet: Number(calc.boletaNet ?? 0),
    withholdingRate: Number(calc.withholdingRate ?? 0),
    withholdingAmount: Number(calc.withholdingAmount ?? 0),
    advancesTotal: Number(calc.advancesTotal ?? 0),
    finalTransferAmount: Number(calc.finalTransferAmount ?? 0),
    eventCount: Number(calc.eventCount ?? 0),
    reimbursementsTotal: Number(calc.reimbursementsTotal ?? 0),
    reimbursementsPaidTotal: Number(calc.reimbursementsPaidTotal ?? 0),
    reimbursementsPendingTotal: Number(calc.reimbursementsPendingTotal ?? 0),
    calculation: {
      ...account.calculation,
      details: (calc.details ??
        []) as StaffMonthlyAccount["calculation"]["details"],
    },
  };
}

export type FirstFortnightSummary = {
  staff_id: string;
  staff_name: string;
  work_net: number;
  training_net: number;
  reimbursements: number;
  paid: number;
  pending: number;
  review_required: boolean;
  review_reason: string;
};
