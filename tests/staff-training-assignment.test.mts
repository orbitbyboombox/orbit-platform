import assert from "node:assert/strict";
import test from "node:test";
import { previewTrainingAssignment } from "../lib/staff-training-assignment.ts";

const base = { eventId: "event-1", traineeStaffId: "trainee-1", trainerStaffId: "trainer-1", normalOperatorRateClp: 12000 };

test("links a trainee and trainer to an event at half the normal operator rate", () => {
  assert.deepEqual(previewTrainingAssignment(base), {
    ...base, role: "TRAINING", ratePercent: 50, amountClp: 6000,
  });
});
test("requires event and both different staff members", () => {
  assert.throws(() => previewTrainingAssignment({ ...base, eventId: "" }));
  assert.throws(() => previewTrainingAssignment({ ...base, traineeStaffId: "" }));
  assert.throws(() => previewTrainingAssignment({ ...base, trainerStaffId: "" }));
  assert.throws(() => previewTrainingAssignment({ ...base, trainerStaffId: "trainee-1" }));
});
test("does not allow invalid event tariffs", () => {
  assert.throws(() => previewTrainingAssignment({ ...base, normalOperatorRateClp: -100 }));
});
