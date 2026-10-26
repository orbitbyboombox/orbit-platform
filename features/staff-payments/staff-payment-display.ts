export type StaffPaymentComponents = {
  assembly: number;
  operator: number;
  disassembly: number;
  transport?: number;
  parking?: number;
};

/** Event 360 total derived from canonical role components, not a stale row total. */
export function canonicalStaffPaymentTotal({ assembly, operator, disassembly, transport = 0, parking = 0 }: StaffPaymentComponents): number {
  return [assembly, operator, disassembly, transport, parking]
    .map((value) => Number.isFinite(value) ? value : 0)
    .reduce((sum, value) => sum + value, 0);
}
