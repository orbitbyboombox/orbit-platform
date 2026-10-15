export type CanonicalStaffObligationInput = {
  tasks: readonly string[];
  totalInternalPayment: number;
  operator: number;
  assembly: number;
  disassembly: number;
};

export function deriveCanonicalStaffObligation(input: CanonicalStaffObligationInput) {
  const total = Math.max(0, Number(input.totalInternalPayment) || 0);
  const singleRole = input.tasks.length === 1 ? input.tasks[0] : null;
  if (singleRole && total > 0) {
    return {
      operator: singleRole === "OPERATOR" ? total : 0,
      assembly: singleRole === "ASSEMBLY" ? total : 0,
      disassembly: singleRole === "DISASSEMBLY" ? total : 0,
      total,
    };
  }
  const operator = Math.max(0, Number(input.operator) || 0);
  const assembly = Math.max(0, Number(input.assembly) || 0);
  const disassembly = Math.max(0, Number(input.disassembly) || 0);
  return { operator, assembly, disassembly, total: operator + assembly + disassembly };
}

export function deriveCanonicalStaffHonorariaBalance(input: {
  originalNet: number;
  adjustmentTotal?: number;
  paidAmount?: number;
}) {
  const gross = Math.max(0, Number(input.originalNet) || 0) + (Number(input.adjustmentTotal) || 0);
  const paid = Math.max(0, Number(input.paidAmount) || 0);
  return { gross, paid, outstanding: Math.max(0, gross - paid) };
}
