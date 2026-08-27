export const corporateCreditTermDays = [15, 30, 45, 60, 90] as const;

export function normalizeCorporateCreditDays(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function assertCorporateCreditTerms(input: {
  paymentCondition: string;
  paymentTermDays: unknown;
  approved?: boolean;
}) {
  if (input.paymentCondition !== "CORPORATE_CREDIT") return 0;
  const days = normalizeCorporateCreditDays(input.paymentTermDays);
  if (days <= 0)
    throw new Error("Selecciona un plazo de crédito Empresa mayor a 0 días.");
  if (input.approved === false)
    throw new Error("Debes aprobar el crédito corporativo antes de confirmar.");
  return days;
}

export function corporateCreditDueDate(issueDate: Date, paymentTermDays: unknown) {
  const days = normalizeCorporateCreditDays(paymentTermDays);
  if (days <= 0)
    throw new Error("El crédito Empresa requiere un plazo positivo en días.");
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate;
}
