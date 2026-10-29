export type OfficialStaffRate = { code: string; amount: number | string };

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

/**
 * November 2026 rate calculation. Date is the local event date in
 * America/Santiago (YYYY-MM-DD), never the publication or payment date.
 * This helper does not modify persisted settlements.
 */
export function effectiveStaffAssignmentPayment(
  rates: readonly OfficialStaffRate[],
  hours: number,
  responsibility: string,
  eventLocalDate: string,
  transportationBonus = 0,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventLocalDate) ||
      !Number.isFinite(Date.parse(eventLocalDate + "T12:00:00Z")) ||
      new Date(eventLocalDate + "T12:00:00Z").toISOString().slice(0, 10) !== eventLocalDate) {
    throw new Error("Invalid event date: expected YYYY-MM-DD");
  }
  if (eventLocalDate < "2026-11-01") {
    return officialStaffAssignmentPayment(rates, hours, responsibility, transportationBonus);
  }
  let payment: number;
  if (responsibility === "OPERATOR" || responsibility === "SUPERVISOR") {
    if (!Number.isFinite(hours) || hours < 2) throw new Error("Operator/supervisor duration must be at least 2 hours");
    payment = 20000 + (hours - 2) * 5000;
  } else if (responsibility === "ASSEMBLY" || responsibility === "DISASSEMBLY") {
    payment = 10000;
  } else if (responsibility === "ASSEMBLY_DISASSEMBLY") {
    payment = 20000;
  } else {
    throw new Error("Unknown staff responsibility");
  }
  return payment + Math.max(0, transportationBonus);
}
