export type OfficialStaffRate = { code: string; amount: number | string };

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
