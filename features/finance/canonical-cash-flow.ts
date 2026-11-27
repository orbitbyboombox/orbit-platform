import { selectCanonicalFuelLogs, type CanonicalFuelCandidate } from "./canonical-fuel.ts";
import { invoicePaymentCashImpact } from "../accounts-receivable/canonical-financial-state.ts";

export type CanonicalInvoicePayment = {
  id: string;
  invoice_id: string;
  amount: number | string | null;
  movement_type?: string | null;
  paid_at: string;
  method?: string | null;
};

export type CanonicalStaffMovement = {
  id: string;
  settlement_id: string;
  movement_type: string;
  amount: number | string | null;
  movement_date: string;
  method?: string | null;
};

const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function isQaOrTestMarker(...values: readonly unknown[]): boolean {
  return values.some((value) => /(^|[\s/_-])(qa|test)([\s/_-]|$)/i.test(String(value ?? "").trim()));
}

export { invoicePaymentCashImpact };

export function signedStaffMovement(movement: CanonicalStaffMovement): number {
  return movement.movement_type.toUpperCase() === "REVERSAL"
    ? -Math.abs(amount(movement.amount))
    : amount(movement.amount);
}

export function shouldIncludeStaffBlockCost(
  settlementId: string | null | undefined,
  activeSettlementIds: ReadonlySet<string>,
): boolean {
  // A block cost with a settlement is the projection of that settlement, not
  // a second payable. Only unresolved rows without a canonical settlement can
  // remain as a pending obligation.
  return !settlementId || !activeSettlementIds.has(settlementId);
}

export function buildCanonicalFuelCandidates(
  rows: readonly CanonicalFuelCandidate[],
  materializedExpenseReceiptPaths: ReadonlySet<string>,
) {
  return selectCanonicalFuelLogs(rows, materializedExpenseReceiptPaths);
}

export function officeLeaseIncomeImpact(itemType: string | null | undefined, value: number | string | null): number {
  // Security deposits are cash inflows, but are kept distinguishable by the
  // caller so they are not treated as recurring operating revenue.
  return amount(value);
}
