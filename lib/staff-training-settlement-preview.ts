export type TrainingSettlementCandidate = {
  id: string;
  status: "PLANNED" | "COMPLETED" | "CANCELLED";
  trainingAmountClp: number;
};

/** Read-only reconciliation; NEVER creates or modifies a settlement. */
export function trainingSettlementPreview(records: TrainingSettlementCandidate[]) {
  const completed = records.filter(record => record.status === "COMPLETED");
  for (const record of completed) {
    if (!Number.isSafeInteger(record.trainingAmountClp) || record.trainingAmountClp < 0) {
      throw new Error("Invalid training amount");
    }
  }
  return {
    completedCount: completed.length,
    pendingCount: records.filter(record => record.status === "PLANNED").length,
    cancelledCount: records.filter(record => record.status === "CANCELLED").length,
    payableClp: completed.reduce((sum, record) => sum + record.trainingAmountClp, 0),
  };
}
