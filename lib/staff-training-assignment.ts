import { calculateTrainingPay } from "./staff-training-pay.ts";

export type TrainingAssignment = {
  eventId: string;
  traineeStaffId: string;
  trainerStaffId: string;
  normalOperatorRateClp: number;
};

export type TrainingPreview = TrainingAssignment & {
  role: "TRAINING";
  ratePercent: 50;
  amountClp: number;
};

/** Prepare a training assignment without creating a settlement or writing to production. */
export function previewTrainingAssignment(input: TrainingAssignment): TrainingPreview {
  const { eventId, traineeStaffId, trainerStaffId, normalOperatorRateClp } = input;
  if (!eventId.trim() || !traineeStaffId.trim() || !trainerStaffId.trim()) {
    throw new Error("Event, trainee and trainer are required");
  }
  if (traineeStaffId === trainerStaffId) {
    throw new Error("Trainee and trainer must be different staff members");
  }
  return {
    ...input,
    role: "TRAINING",
    ratePercent: 50,
    amountClp: calculateTrainingPay(normalOperatorRateClp),
  };
}
