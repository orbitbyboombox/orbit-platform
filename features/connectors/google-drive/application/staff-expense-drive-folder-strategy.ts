const cleanName = (value: string) => value.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, " ");

export function buildStaffExpenseFolderParts(staffName: string, occurredOn: string): string[] {
  const date = new Date(`${occurredOn.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha occurred_on inválida.");
  return [
    "STAFF",
    "OPERADORES",
    cleanName(staffName),
    String(date.getUTCFullYear()),
    date.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    "04_GASTOS_Y_REEMBOLSOS",
  ];
}
