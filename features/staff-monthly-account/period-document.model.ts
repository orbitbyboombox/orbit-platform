import { formatDisplayDate } from "../../lib/display-date.ts";
import { mapStaffMonthlyAccount } from "./model.ts";
import {
  periodLabel,
  periodPdfAccount,
  type StaffPaymentPeriod,
  type StaffPeriodPreview,
} from "./payment-periods.model.ts";

export type PeriodDocumentPayload = {
  account: Record<string, unknown>;
  period: StaffPaymentPeriod;
  monthly: Record<string, unknown>;
  first: StaffPaymentPeriod | null;
  staff: {
    id: string;
    name: string;
    firstName: string;
    email: string;
    rut: string;
    role: string;
  };
  company: { legalName: string; taxId: string; address: string; city: string };
};
export type PeriodDocumentSummary = {
  code: "Q1" | "Q2" | "MONTH";
  firstWork: number;
  firstPaid: number;
  periodWork: number;
  monthlyWork: number;
  monthlyGross: number;
  monthlyRetention: number;
  rate: number;
  paid: number;
  remaining: number;
  reimbursements: number;
  reimbursementsPending: number;
};
export function periodDocumentInput(payload: PeriodDocumentPayload) {
  const { period, monthly, first } = payload;
  const calc = period.snapshot;
  if (!calc) throw new Error("El bloque no tiene una liquidación verificable.");
  const amount = (r: Record<string, unknown>, key: string) =>
    Number(r[key] ?? 0);
  const firstWork = Number(first?.snapshot?.workNet ?? 0);
  const periodWork = amount(calc, "workNet"),
    monthlyWork = amount(monthly, "workNet");
  if (
    period.period_code === "Q2" &&
    (!first?.snapshot || Math.abs(firstWork + periodWork - monthlyWork) > 0.01)
  )
    throw new Error("Los bloques no concilian con los honorarios mensuales.");
  const details = (monthly.details ?? []) as Record<string, unknown>[];
  const summary: PeriodDocumentSummary = {
    code: period.period_code,
    firstWork,
    firstPaid: details
      .filter(
        (d) =>
          first &&
          String(d.eventDate) >= first.starts_on &&
          String(d.eventDate) <= first.ends_on,
      )
      .reduce((sum, d) => sum + amount(d, "workPaid"), 0),
    periodWork,
    monthlyWork,
    monthlyGross: amount(monthly, "boletaGross"),
    monthlyRetention: amount(monthly, "withholdingAmount"),
    rate: amount(monthly, "withholdingRate"),
    paid: amount(monthly, "workPaid"),
    remaining: amount(monthly, "workPending"),
    reimbursements: amount(monthly, "reimbursementsTotal"),
    reimbursementsPending: amount(monthly, "reimbursementsPendingTotal"),
  };
  const account = periodPdfAccount(mapStaffMonthlyAccount(payload.account), {
    ...period,
    calculation: calc,
    paidAmount: 0,
    remaining: 0,
  } as StaffPeriodPreview);
  // Monthly boleta is based on all earned fees, never net of earlier payments.
  if (period.period_code !== "Q1") account.boletaGross = summary.monthlyGross;
  return {
    account,
    staff: payload.staff,
    periodTitle: `${periodLabel(period.period_code)} | ${formatDisplayDate(period.starts_on)} - ${formatDisplayDate(period.ends_on)}`,
    firstQuincena: period.period_code === "Q1",
    periodSummary: summary,
  };
}
