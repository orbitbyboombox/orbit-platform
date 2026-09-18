import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createProcessingActivityTicker, formatElapsedSeconds } from "../features/automatic-booking/processing-activity.ts";

test("processing activity ticker updates elapsed seconds and cleans up", () => {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: 0 });
  try {
    const values: number[] = [];
    const stop = createProcessingActivityTicker(value => values.push(value));
    assert.deepEqual(values, [0]);
    mock.timers.tick(1_000);
    mock.timers.tick(9_000);
    assert.equal(values.at(-1), 10);
    stop();
    const countAfterStop = values.length;
    mock.timers.tick(5_000);
    assert.equal(values.length, countAfterStop);
  } finally {
    mock.timers.reset();
  }
});

test("elapsed time formatting stays a clock, not progress", () => {
  assert.equal(formatElapsedSeconds(0), "00:00");
  assert.equal(formatElapsedSeconds(1), "00:01");
  assert.equal(formatElapsedSeconds(10), "00:10");
  assert.equal(formatElapsedSeconds(61), "01:01");
});
