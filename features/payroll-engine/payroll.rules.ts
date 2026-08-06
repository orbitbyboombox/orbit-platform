import type { OperationalTask, SantiagoProvince, StaffCapability, StaffGroup } from "./types";

export const OPERATOR_PAYMENT_BY_HOURS = Object.freeze({
  2: 14_000,
  3: 19_000,
  4: 24_000,
  5: 27_000,
  6: 32_000,
  7: 37_000,
  8: 42_000,
  9: 47_000,
  10: 52_000,
} as const);

export const ASSEMBLY_PAYMENT = 7_000;
export const DISASSEMBLY_PAYMENT = 7_000;
export const ASSEMBLY_AND_DISASSEMBLY_PAYMENT = 15_000;

export const TRANSPORT_BONUS_BY_PROVINCE: Readonly<Record<SantiagoProvince, number>> = Object.freeze({
  SANTIAGO: 0,
  CHACABUCO: 12_000,
  CORDILLERA: 12_000,
  MAIPO: 12_000,
  MELIPILLA: 17_000,
  TALAGANTE: 17_000,
});

export const STAFF_CAPABILITIES: Readonly<Record<StaffGroup, StaffCapability>> = Object.freeze({
  CALYPSO: { group: "CALYPSO", allowedTasks: ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"] },
  GREEN: { group: "GREEN", allowedTasks: ["OPERATOR"] },
});

export function canPerformTask(group: StaffGroup, task: OperationalTask): boolean {
  return STAFF_CAPABILITIES[group].allowedTasks.includes(task);
}
