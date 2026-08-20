export type MonthlyFinancePerformance = {
  eventResult: number;
  operatingResult: number;
  eventMargin: number;
  operatingMargin: number;
};

export function calculateMonthlyFinancePerformance(input: {
  revenue: number;
  directEventCosts: number;
  fixedMonthlyExpenses: number;
}): MonthlyFinancePerformance {
  const eventResult = input.revenue - input.directEventCosts;
  const operatingResult = eventResult - input.fixedMonthlyExpenses;
  return {
    eventResult,
    operatingResult,
    eventMargin: input.revenue ? (eventResult / input.revenue) * 100 : 0,
    operatingMargin: input.revenue ? (operatingResult / input.revenue) * 100 : 0,
  };
}
