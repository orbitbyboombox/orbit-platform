export type OperationalTask = "ASSEMBLY" | "OPERATOR" | "DISASSEMBLY";
export type StaffGroup = "CALYPSO" | "GREEN";
export type SantiagoProvince = "SANTIAGO" | "CHACABUCO" | "CORDILLERA" | "MAIPO" | "MELIPILLA" | "TALAGANTE";

export interface PayrollInput {
  readonly contractedHours: number;
  readonly tasks: readonly OperationalTask[];
  readonly province: SantiagoProvince;
  readonly approvedParking?: number;
}

export interface PayrollCalculation {
  readonly assemblyPayment: number;
  readonly operatorPayment: number;
  readonly disassemblyPayment: number;
  readonly transportBonus: number;
  readonly parkingPayment: number;
  readonly totalInternalPayment: number;
}

export interface StaffCapability {
  readonly group: StaffGroup;
  readonly allowedTasks: readonly OperationalTask[];
}
