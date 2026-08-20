export const FIXED_EXPENSE_SCOPE = "BUSINESS_OVERHEAD";

export interface FixedExpenseRule {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: "CLP" | "USD";
  frequency: string;
  active: boolean;
  nextDueDate: string;
  metadata: Record<string, unknown>;
}

export interface FixedExpenseSummary {
  items: FixedExpenseRule[];
  monthlyTotal: number;
  annualReference: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function isFixedMonthlyExpense(rule: FixedExpenseRule, asOf = new Date()): boolean {
  const effectiveStart = text(rule.metadata.effectiveStart);
  const effectiveEnd = text(rule.metadata.effectiveEnd);
  const day = asOf.toISOString().slice(0, 10);
  return rule.active
    && rule.currency === "CLP"
    && rule.frequency === "MONTHLY"
    && rule.metadata.costScope === FIXED_EXPENSE_SCOPE
    && rule.metadata.fixedExpense === true
    && (!effectiveStart || effectiveStart <= day)
    && (!effectiveEnd || effectiveEnd >= day);
}

export function summarizeFixedMonthlyExpenses(rules: readonly FixedExpenseRule[], asOf = new Date()): FixedExpenseSummary {
  const items = rules.filter((rule) => isFixedMonthlyExpense(rule, asOf));
  const monthlyTotal = items.reduce((sum, rule) => sum + rule.amount, 0);
  return { items, monthlyTotal, annualReference: monthlyTotal * 12 };
}

export function calculateMonthlyOperatingResult(input: {
  realIncome: number;
  directEventCosts: number;
  fixedMonthlyExpenses: number;
}): number {
  return input.realIncome - input.directEventCosts - input.fixedMonthlyExpenses;
}
