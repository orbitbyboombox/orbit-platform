export function shiftEventScheduleDate(
  value: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  if (!value || !fromDate || !toDate || fromDate === toDate) return value ?? "";
  const [datePart, timePart = "00:00"] = value.slice(0, 16).split("T");
  if (!datePart) return value;
  const from = new Date(`${fromDate}T12:00:00Z`);
  const to = new Date(`${toDate}T12:00:00Z`);
  const current = new Date(`${datePart}T12:00:00Z`);
  if ([from, to, current].some((item) => Number.isNaN(item.getTime())))
    return value;
  current.setUTCDate(
    current.getUTCDate() +
      Math.round((to.getTime() - from.getTime()) / 86_400_000),
  );
  return `${current.toISOString().slice(0, 10)}T${timePart.slice(0, 5)}`;
}
