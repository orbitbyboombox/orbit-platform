export type OfficialStaffRate = { code: string; amount: number | string };

export function formatOperationalBlockDuration(minutes: number | null | undefined) {
  if (!Number.isInteger(minutes) || Number(minutes) <= 0) return null;
  const value = Number(minutes);
  return `${Math.floor(value / 60)}h${String(value % 60).padStart(2, "0")}`;
}

export function officialStaffRateCodeForMinutes(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 120 || minutes > 600 || minutes % 60 !== 0) return null;
  return `OPERATOR_${minutes / 60}_HOURS`;
}

export function resolveOfficialOperatorRate(
  rates: readonly OfficialStaffRate[],
  minutes: number,
) {
  if (!Number.isInteger(minutes) || minutes < 120 || minutes > 600) return { code: null, amount: null };
  const exactCode = officialStaffRateCodeForMinutes(minutes);
  if (exactCode) {
    const amount = rates.find((item) => item.code === exactCode)?.amount;
    return { code: exactCode, amount: amount === undefined ? null : Number(amount) };
  }
  const lowerHours = Math.floor(minutes / 60);
  const upperHours = Math.ceil(minutes / 60);
  const lower = Number(rates.find((item) => item.code === `OPERATOR_${lowerHours}_HOURS`)?.amount);
  const upper = Number(rates.find((item) => item.code === `OPERATOR_${upperHours}_HOURS`)?.amount);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upperHours > 10) return { code: null, amount: null };
  const fraction = (minutes - lowerHours * 60) / 60;
  return { code: null, amount: Math.round(lower + (upper - lower) * fraction) };
}

export function officialStaffAssignmentPayment(
  rates: readonly OfficialStaffRate[],
  hours: number,
  responsibility: string,
  transportationBonus = 0,
) {
  const rate = new Map(rates.map((item) => [item.code, Number(item.amount)]));
  const rolePayment =
    (responsibility === "OPERATOR" || responsibility === "SUPERVISOR")
      ? (rate.get(`OPERATOR_${hours}_HOURS`) ?? 0)
      : responsibility === "ASSEMBLY"
        ? (rate.get("ASSEMBLY") ?? 0)
        : responsibility === "DISASSEMBLY"
          ? (rate.get("DISASSEMBLY") ?? 0)
          : (rate.get("ASSEMBLY_DISASSEMBLY") ?? 0);
  return rolePayment + Math.max(0, transportationBonus);
}

export const STAFF_RATE_EFFECTIVE_DATE = "2026-11-01";

/**
 * Founder-approved rates effective for events on or after 2026-11-01.
 * `eventLocalDate` is the event's Chilean calendar date, not a timestamp.
 */
export function effectiveStaffAssignmentPayment(
  rates: readonly OfficialStaffRate[],
  hours: number,
  responsibility: string,
  eventLocalDate: string,
  transportationBonus = 0,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventLocalDate)) {
    throw new Error("Invalid event date: expected YYYY-MM-DD");
  }
  if (eventLocalDate < STAFF_RATE_EFFECTIVE_DATE) {
    return officialStaffAssignmentPayment(rates, hours, responsibility, transportationBonus);
  }
  if (!Number.isFinite(hours) || hours < 2) {
    throw new Error("Operator/supervisor duration must be at least 2 hours");
  }
  const payment =
    responsibility === "OPERATOR" || responsibility === "SUPERVISOR"
      ? 20_000 + (hours - 2) * 5_000
      : responsibility === "ASSEMBLY" || responsibility === "DISASSEMBLY"
        ? 10_000
        : responsibility === "ASSEMBLY_DISASSEMBLY"
          ? 20_000
          : (() => { throw new Error("Unknown staff responsibility"); })();
  return Math.round(payment + Math.max(0, transportationBonus));
}

export function staffAssignmentPaymentForEvent(
  rates: readonly OfficialStaffRate[],
  hours: number,
  responsibility: string,
  eventLocalDate: string,
  transportationBonus = 0,
) {
  return effectiveStaffAssignmentPayment(rates, hours, responsibility, eventLocalDate, transportationBonus);
}

export function resolveStaffRateForEvent(
  rates: readonly OfficialStaffRate[],
  minutes: number,
  responsibility: string,
  eventLocalDate: string,
  transportationBonus = 0,
) {
  if (!Number.isInteger(minutes) || minutes < 120 || minutes > 600) return null;
  if (eventLocalDate < STAFF_RATE_EFFECTIVE_DATE) {
    if (responsibility === "OPERATOR" || responsibility === "SUPERVISOR") {
      return resolveOfficialOperatorRate(rates, minutes).amount;
    }
    const code = responsibility === "ASSEMBLY" ? "ASSEMBLY" : responsibility === "DISASSEMBLY" ? "DISASSEMBLY" : "ASSEMBLY_DISASSEMBLY";
    const amount = rates.find((item) => item.code === code)?.amount;
    return amount === undefined ? null : Number(amount) + Math.max(0, transportationBonus);
  }
  return effectiveStaffAssignmentPayment(
    rates,
    minutes / 60,
    responsibility,
    eventLocalDate,
    transportationBonus,
  );
}
