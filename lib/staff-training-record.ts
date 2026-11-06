import { previewTrainingAssignment, type TrainingAssignment } from "./staff-training-assignment.ts";

export type TrainingRecord = ReturnType<typeof previewTrainingAssignment> & {
  assignmentId: string;
  status: "PLANNED" | "COMPLETED" | "CANCELLED";
};

/** Idempotent identifier for one trainee's training on one event. */
export function trainingAssignmentKey(eventId: string, traineeStaffId: string): string {
  if (!eventId.trim() || !traineeStaffId.trim()) throw new Error("Event and trainee required");
  return `training:${encodeURIComponent(eventId)}:${encodeURIComponent(traineeStaffId)}`;
}

/** Pure domain operation: no database writes and no settlement mutations. */
export function createTrainingRecord(input: TrainingAssignment): TrainingRecord {
  const preview = previewTrainingAssignment(input);
  return {
    ...preview,
    assignmentId: trainingAssignmentKey(input.eventId, input.traineeStaffId),
    status: "PLANNED",
  };
}

/** Only completed training is eligible to be included in a future settlement. */
export function eligibleTrainingPayment(record: TrainingRecord): number {
  return record.status === "COMPLETED" ? record.amountClp : 0;
}
