export type OfficialStaffRate = { code: string; amount: number | string };

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
    responsibility === "OPERATOR"
      ? (rate.get(`OPERATOR_${hours}_HOURS`) ?? 0)
      : responsibility === "ASSEMBLY"
        ? (rate.get("ASSEMBLY") ?? 0)
        : responsibility === "DISASSEMBLY"
          ? (rate.get("DISASSEMBLY") ?? 0)
          : (rate.get("ASSEMBLY_DISASSEMBLY") ?? 0);
  return rolePayment + Math.max(0, transportationBonus);
}
