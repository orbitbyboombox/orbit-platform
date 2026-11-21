import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewTrainingAssignment } from "../lib/staff-training-assignment.ts";

test("training assignment is a preview, not a payment or database write", () => {
  const panel = readFileSync(new URL("../components/staff-training-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /disabled=\{!result\.preview \|\| !onConfirm\}/);
  assert.match(panel, /onConfirm\(result\.preview\)/);
  assert.doesNotMatch(panel, /supabase|service_role|fetch\(/i);
});
test("standard operator tariff is independent of trainer pay", () => {
  const data = previewTrainingAssignment({
    eventId: "event-42", traineeStaffId: "new-staff", trainerStaffId: "mentor",
    normalOperatorRateClp: 24000,
  });
  assert.equal(data.amountClp, 12000);
  assert.equal(data.role, "TRAINING");
});
