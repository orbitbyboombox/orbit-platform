/** Staff training pay: 50% of the event's normal operator tariff.
 * This function is deliberately independent of settlements and production writes.
 * Do not calculate from the trainer's personalized payment.
 */
export function calculateTrainingPay(normalOperatorRate: number): number {
  if (!Number.isSafeInteger(normalOperatorRate) || normalOperatorRate < 0) {
    throw new RangeError("normalOperatorRate must be a nonnegative integer amount in CLP");
  }
  return Math.round(normalOperatorRate / 2);
}
