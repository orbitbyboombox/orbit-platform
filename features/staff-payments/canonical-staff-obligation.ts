export function deriveCanonicalStaffHonorariaBalance(input: {
  originalNet: number;
  adjustmentTotal?: number;
  paidAmount?: number;
}) {
  const gross = Math.max(0, Number(input.originalNet) || 0) + (Number(input.adjustmentTotal) || 0);
  const paid = Math.max(0, Number(input.paidAmount) || 0);
  return { gross, paid, outstanding: Math.max(0, gross - paid) };
}
