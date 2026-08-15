export type FinancialAlertRule = { code: string; name: string; firstNoticeDay: number; escalationDay: number; timezone: string };

export function santiagoPeriod(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { period: `${get("year")}-${get("month")}`, day: Number(get("day")) };
}

export function financialAlertState(rule: FinancialAlertRule, now: Date, paid = false) {
  if (paid) return null;
  const { period, day } = santiagoPeriod(now);
  if (day < rule.firstNoticeDay) return null;
  return { key: `${rule.code}-${period}`, title: day >= rule.escalationDay ? `${rule.name} HOY` : rule.name, priority: day >= rule.escalationDay ? "CRITICAL" as const : "HIGH" as const };
}
