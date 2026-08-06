import { ASSEMBLY_AND_DISASSEMBLY_PAYMENT, ASSEMBLY_PAYMENT, DISASSEMBLY_PAYMENT, OPERATOR_PAYMENT_BY_HOURS, TRANSPORT_BONUS_BY_PROVINCE } from "./payroll.rules";
import type { PayrollCalculation, PayrollInput } from "./types";

export function calculateOperationalPayroll(input: PayrollInput): PayrollCalculation {
  if (!Number.isInteger(input.contractedHours) || input.contractedHours < 2 || input.contractedHours > 10) {
    throw new Error("La duración operacional debe estar entre 2 y 10 horas.");
  }
  if ((input.approvedParking ?? 0) < 0) throw new Error("El estacionamiento aprobado no puede ser negativo.");
  const hasAssembly = input.tasks.includes("ASSEMBLY");
  const hasDisassembly = input.tasks.includes("DISASSEMBLY");
  const combined = hasAssembly && hasDisassembly;
  const assemblyPayment = combined ? ASSEMBLY_AND_DISASSEMBLY_PAYMENT : hasAssembly ? ASSEMBLY_PAYMENT : 0;
  const disassemblyPayment = combined ? 0 : hasDisassembly ? DISASSEMBLY_PAYMENT : 0;
  const operatorPayment = input.tasks.includes("OPERATOR") ? OPERATOR_PAYMENT_BY_HOURS[input.contractedHours as keyof typeof OPERATOR_PAYMENT_BY_HOURS] : 0;
  const transportBonus = TRANSPORT_BONUS_BY_PROVINCE[input.province];
  const parkingPayment = input.approvedParking ?? 0;
  return { assemblyPayment, operatorPayment, disassemblyPayment, transportBonus, parkingPayment, totalInternalPayment: assemblyPayment + operatorPayment + disassemblyPayment + transportBonus + parkingPayment };
}
