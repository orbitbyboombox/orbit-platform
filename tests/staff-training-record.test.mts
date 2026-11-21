import assert from "node:assert/strict";
import test from "node:test";
import { createTrainingRecord, eligibleTrainingPayment, trainingAssignmentKey } from "../lib/staff-training-record.ts";

const input = { eventId: "event-2026-11", traineeStaffId: "new-operator", trainerStaffId: "experienced-operator", normalOperatorRateClp: 12000 };

test("training uses a deterministic key to prevent duplicate assignments", () => {
  assert.equal(trainingAssignmentKey(input.eventId, input.traineeStaffId), trainingAssignmentKey(input.eventId, input.traineeStaffId));
  assert.notEqual(trainingAssignmentKey(input.eventId, input.traineeStaffId), trainingAssignmentKey(input.eventId, "other-operator"));
});
test("planned and cancelled training do not enter a settlement", () => {
  const planned = createTrainingRecord(input);
  assert.equal(planned.status, "PLANNED");
  assert.equal(eligibleTrainingPayment(planned), 0);
  assert.equal(eligibleTrainingPayment({ ...planned, status: "CANCELLED" }), 0);
});
test("completed training becomes eligible at exactly half the normal rate", () => {
  const planned = createTrainingRecord(input);
  assert.equal(eligibleTrainingPayment({ ...planned, status: "COMPLETED" }), 6000);
});
