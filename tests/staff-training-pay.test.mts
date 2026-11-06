import assert from "node:assert/strict";
import test from "node:test";
import { calculateTrainingPay } from "../lib/staff-training-pay.ts";

test("training pay is exactly half the standard event operator tariff", () => {
  assert.equal(calculateTrainingPay(12000), 6000);
  assert.equal(calculateTrainingPay(15000), 7500);
  assert.equal(calculateTrainingPay(0), 0);
});
test("odd peso tariffs round to the nearest peso", () => {
  assert.equal(calculateTrainingPay(13001), 6501);
});
test("invalid amounts are rejected before creating a payment", () => {
  for (const amount of [-1, 12.5, NaN, Infinity]) {
    assert.throws(() => calculateTrainingPay(amount), RangeError);
  }
});
