import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("automatic booking claims one invitation and resumes the same project", async () => {
  const source = await read("features/automatic-booking/complete-automatic-booking.service.ts");
  assert.match(source, /status: \"PROCESSING\"/);
  assert.match(source, /in\(\"status\", \[\"SENT\", \"OPENED\"\]\)/);
  assert.match(source, /invitation\.project_id \?\?/);
  assert.match(source, /project_id: projectId/);
  assert.match(source, /BOOKING_IN_PROGRESS/);
});

test("automatic booking creates canonical invoice/reservation before payment", async () => {
  const source = await read("features/automatic-booking/complete-automatic-booking.service.ts");
  const records = source.indexOf('admin.rpc("prepare_confirmed_reservation_records"');
  const payment = source.indexOf('admin.rpc("register_automatic_booking_deposit"');
  assert.ok(records > 0 && payment > records);
  assert.match(source, /preflight_reservation_capacity/);
});

test("automatic booking exposes structured stage/code/request diagnostics", async () => {
  const [service, route, migration] = await Promise.all([
    read("features/automatic-booking/complete-automatic-booking.service.ts"),
    read("app/api/booking/[token]/confirm/route.ts"),
    read("supabase/migrations/20260917110000_automatic_booking_transaction_boundary.sql"),
  ]);
  for (const value of ["requestId", "failure_code", "failure_stage", "FAILED_RETRYABLE", "CAPACITY_UNAVAILABLE", "PAYMENT_VALIDATION_FAILED"]) assert.match(`${service}\n${route}\n${migration}`, new RegExp(value));
  assert.doesNotMatch(service, /exception:\s*String\(error\)/);
});

test("final capacity check is the shared database boundary", async () => {
  const migration = await read("supabase/migrations/20260917110000_automatic_booking_transaction_boundary.sql");
  assert.match(migration, /_preflight_draft_capacity_core/);
  assert.match(migration, /preflight_reservation_capacity/);
});

test("smoke mode is server-side and fixture-scoped", async () => {
  const [smoke, service, signature, pipeline] = await Promise.all([
    read("features/automatic-booking/automatic-booking-smoke.ts"),
    read("features/automatic-booking/complete-automatic-booking.service.ts"),
    read("features/projects/signing/digital-signature.service.ts"),
    read("features/projects/operations/confirmed-reservation-pipeline.service.ts"),
  ]);
  assert.match(smoke, /AUTOMATIC_BOOKING_SMOKE_MODE/);
  assert.match(smoke, /smokeFixture/);
  assert.match(service, /isAutomaticBookingSmokeMode\(invitation\.payload\)/);
  assert.match(signature, /smokeMode\?/);
  assert.match(pipeline, /!input\.smokeMode/);
});

test("completed invitations replay the existing booking", async () => {
  const [service, route] = await Promise.all([
    read("features/automatic-booking/complete-automatic-booking.service.ts"),
    read("app/api/booking/[token]/confirm/route.ts"),
  ]);
  assert.match(service, /status === "COMPLETED"/);
  assert.match(service, /state === "CONFIRMED"/);
  assert.match(service, /alreadyConfirmed: true/);
  assert.match(route, /BOOKING_ALREADY_CONFIRMED/);
});
