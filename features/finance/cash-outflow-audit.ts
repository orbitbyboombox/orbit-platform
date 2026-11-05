/**
 * Read-only Staff / office cash-outflow evidence.
 * Recorded payments are not bank-confirmed transactions.
 * Never add settlements, advances, reimbursement requests or recurring rules
 * to these movements: they can represent the same economic obligation.
 */
export type CashEvidenceSource =
  | "event_staff_settlement_movements"
  | "staff_reimbursement_payments"
  | "office_lease_payments";
export type CashEvidence = {
  source: CashEvidenceSource;
  id: string;
  amount: number;
  paidOn: string | null;
  settlementId?: string | null;
  expenseId?: string | null;
  submissionId?: string | null;
};
export type CashEvidenceAudit = {
  recordedPayments: number;
  bankConfirmed: number;
  pendingBankConfirmation: number;
  reviewCount: number;
  rows: Array<CashEvidence & { integrity: "OK" | "REVIEW_REQUIRED"; reasons: string[] }>;
};
export function auditCashOutflow(rows: readonly CashEvidence[]): CashEvidenceAudit {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.source}:${row.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const audited = rows.map((row) => {
    const reasons: string[] = [];
    if (!row.id || (counts.get(`${row.source}:${row.id}`) ?? 0) > 1) reasons.push("DUPLICATE_OR_MISSING_ID");
    if (!Number.isFinite(row.amount) || row.amount < 0) reasons.push("INVALID_AMOUNT");
    if (!row.paidOn || !/^\\d{4}-\\d{2}-\\d{2}$/.test(row.paidOn)) reasons.push("MISSING_PAYMENT_DATE");
    if (row.source === "event_staff_settlement_movements" && !row.settlementId) reasons.push("MISSING_SETTLEMENT_LINK");
    if (row.source === "staff_reimbursement_payments" && !row.expenseId && !row.submissionId && !row.settlementId) reasons.push("UNLINKED_REIMBURSEMENT");
    return { ...row, integrity: reasons.length ? "REVIEW_REQUIRED" as const : "OK" as const, reasons };
  });
  const recordedPayments = audited.reduce((sum, row) => sum + (row.integrity === "OK" ? row.amount : 0), 0);
  return {
    recordedPayments,
    bankConfirmed: 0,
    pendingBankConfirmation: recordedPayments,
    reviewCount: audited.filter((row) => row.integrity === "REVIEW_REQUIRED").length,
    rows: audited,
  };
}
