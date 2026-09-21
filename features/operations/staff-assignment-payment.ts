export type OfficialStaffRate = { code: string; amount: number | string };

export function officialStaffRateCodeForMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `OPERATOR_${whole}_HOURS`;
  if (remainder === 30) return `OPERATOR_${whole}_5_HOURS`;
  return null;
}

export function resolveOfficialOperatorRate(
  rates: readonly OfficialStaffRate[],
  minutes: number,
) {
  const code = officialStaffRateCodeForMinutes(minutes);
  if (!code) return { code: null, amount: null };
  const amount = rates.find((item) => item.code === code)?.amount;
  return { code, amount: amount === undefined ? null : Number(amount) };
}

export function officialStaffAssignmentPayment(
  rates: readonly OfficialStaffRate[],
  hours: number,
  responsibility: string,
  transportationBonus = 0,
) {
  const rate = new Map(rates.map((item) => [item.code, Number(item.amount)]));
  const rolePayment =
    responsibility === "OPERATOR"
      ? (rate.get(`OPERATOR_${hours}_HOURS`) ?? 0)
      : responsibility === "ASSEMBLY"
        ? (rate.get("ASSEMBLY") ?? 0)
        : responsibility === "DISASSEMBLY"
          ? (rate.get("DISASSEMBLY") ?? 0)
          : (rate.get("ASSEMBLY_DISASSEMBLY") ?? 0);
  return rolePayment + Math.max(0, transportationBonus);
}
