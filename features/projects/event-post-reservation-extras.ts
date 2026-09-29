export type PostReservationExtra = { name: string; amount: number; status: "ACTIVE" | "CANCELLED" };

export function activePostReservationExtras(extras: readonly PostReservationExtra[]) {
  return extras.filter((extra) => extra.status === "ACTIVE");
}

export function eventReceivableTotals(input: { originalTotal: number; paidAmount: number; extras: readonly PostReservationExtra[] }) {
  const active = activePostReservationExtras(input.extras);
  const extrasTotal = active.reduce((sum, extra) => sum + Number(extra.amount), 0);
  const total = Number(input.originalTotal) + extrasTotal;
  return { originalTotal: Number(input.originalTotal), extrasTotal, total, paidAmount: Number(input.paidAmount), balance: Math.max(total - Number(input.paidAmount), 0) };
}

export function calendarExtraNames(extras: readonly PostReservationExtra[]) {
  return activePostReservationExtras(extras).map((extra) => extra.name.trim()).filter(Boolean);
}
