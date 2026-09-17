import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL("../features/automatic-booking/complete-automatic-booking.service.ts", import.meta.url);
const routePath = new URL("../app/api/booking/[token]/confirm/route.ts", import.meta.url);

test("automatic booking converges concurrent invitation claims", async () => {
  const service = await readFile(servicePath, "utf8");
  const route = await readFile(routePath, "utf8");
  assert.match(service, /waitForInvitationResolution/);
  assert.match(service, /PROCESSING_POLL_DELAYS_MS/);
  assert.match(service, /status === "PROCESSING"/);
  assert.match(service, /return replayConfirmedBooking\(admin, resolution\.projectId\)/);
  assert.match(service, /in\("status", \["SENT", "OPENED", "FAILED_RETRYABLE"\]\)/);
  assert.match(service, /throw new Error\("BOOKING_IN_PROGRESS"\)/);
  assert.match(route, /failure\.code === "BOOKING_IN_PROGRESS"/);
  assert.match(route, /\? 409/);
});

