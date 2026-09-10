import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/booking/[token]/capacity/route.ts", "utf8");
const experience = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0251_public_booking_capacity_preflight.sql", "utf8");

test("public capacity preflight is token scoped and read-only", () => {
  assert.match(route, /preflight_public_booking_capacity/);
  assert.match(route, /p_booking_token: token/);
  assert.doesNotMatch(route, /confirm|insert|payment/i);
  assert.match(migration, /expires_at>now\(\)/);
  assert.match(migration, /consumed_at is null/);
  assert.match(migration, /status in \('SENT','OPENED'\)/);
  assert.match(migration, /revoke all on function public\.preflight_public_booking_capacity/);
});

test("automatic booking separates technical errors from real review", () => {
  assert.match(experience, /TECHNICAL_ERROR/);
  assert.match(experience, /No pudimos revisar la disponibilidad/);
  assert.match(experience, /capacityMessage/);
});
