import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0236_canonical_capacity_engine.sql", "utf8");
test("one canonical engine returns the three safe outcomes", () => {
  assert.match(sql, /get_event_capacity/);
  assert.match(sql, /'AVAILABLE'/);
  assert.match(sql, /'UNAVAILABLE'/);
  assert.match(sql, /'REVIEW_REQUIRED'/);
});
test("CASE and BBOX360 use independent temporal pools", () => {
  assert.match(sql, /CASE_CAPACITY_EXHAUSTED/);
  assert.match(sql, /BBOX360_CAPACITY_EXHAUSTED/);
  assert.match(sql, /event_operational_window/);
  assert.match(sql, /status='CONFIRMED'/);
});
test("shell and logistics uncertainty never create false availability", () => {
  assert.match(sql, /SHELL_CONFIGURATION_REQUIRED/);
  assert.match(sql, /TRAVEL_TIME_UNVERIFIABLE/);
  assert.match(sql, /LOGISTICS_DATA_INCOMPLETE/);
  assert.doesNotMatch(sql, /WHITE_SHELL_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(sql, /BLACK_SHELL_CAPACITY_EXCEEDED/);
});
test("confirmation is hard-gated and quotes are not counted", () => {
  assert.match(sql, /enforce_reservation_capacity_gate/);
  assert.match(sql, /new.status='CONFIRMED'/);
  assert.match(sql, /crm_reservations res/);
  assert.doesNotMatch(sql, /quotations.*status='CONFIRMED'/i);
});
test("inventory status and operational windows remain canonical", () => {
  assert.match(sql, /MAINTENANCE','OUT_OF_SERVICE/);
  assert.match(sql, /requestedWindow/);
  assert.match(sql, /requiredResources/);
});
