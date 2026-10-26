export type CanonicalRealCostDisplay = {
  total: number;
  breakdown: Record<string, number>;
};

export function canonicalRealCostDisplay(statement: { total_operational_cost?: unknown; cost_breakdown?: unknown } | null | undefined): CanonicalRealCostDisplay | null {
  if (!statement) return null;
  const total = Number(statement.total_operational_cost);
  if (!Number.isFinite(total)) return null;
  const raw = statement.cost_breakdown && typeof statement.cost_breakdown === "object"
    ? statement.cost_breakdown as Record<string, unknown>
    : {};
  return {
    total,
    breakdown: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value) || 0])),
  };
}
