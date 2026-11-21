const cleanName = (value: string) => value.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, " ");
const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

export function buildStaffExpenseFolderParts(staffName: string, occurredOn: string): string[] {
  const date = new Date(`${occurredOn.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha occurred_on inválida.");
  const month = date.getUTCMonth();
  return [
    "02_STAFF",
    "STAFF",
    "OPERADORES",
    cleanName(staffName),
    String(date.getUTCFullYear()),
    `${String(month + 1).padStart(2, "0")} ${MONTHS[month]}`,
    "04_GASTOS_Y_REEMBOLSOS",
  ];
}
