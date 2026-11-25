export const COVERAGE_ROLES = ["ASSEMBLY", "DISASSEMBLY"] as const;

export function normalizeCoverageUnits(value: number | string | null | undefined, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.trunc(parsed), 1), Math.max(1, Math.trunc(maximum)));
}

export function coverageSummary(required: number, assigned: number[]) {
  const target = Math.max(0, Math.trunc(required));
  const covered = assigned.reduce((total, units) => total + Math.max(0, Math.trunc(units)), 0);
  return { required: target, covered, pending: Math.max(0, target - covered), complete: covered >= target };
}

export function unitSubtotal(units: number, totalRate: number, required: number) {
  const target = Math.max(1, Math.trunc(required));
  return Math.round(Math.max(0, units) * Math.max(0, totalRate) / target);
}
