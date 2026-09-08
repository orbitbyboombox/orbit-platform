import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0233_resource_capacity_gate_and_shell_config.sql", "utf8");
const workspace = readFileSync("features/operations/event-operational-readiness.tsx", "utf8");

test("Phase 3 reconciles phantom shells without deleting history", () => {
  for (const code of ["WHITE-09", "WHITE-10", "WHITE-11", "WHITE-12", "BLACK-11", "BLACK-12"]) assert.match(migration, new RegExp(code));
  assert.match(migration, /OUT_OF_SERVICE/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.match(migration, /asset_history/);
});

test("CASE is globally shared and capacity gate is temporal", () => {
  assert.match(migration, /CASE_CAPACITY_EXCEEDED/);
  assert.match(migration, /event_operational_window/);
  assert.match(migration, /status='CONFIRMED'/);
  assert.match(migration, /caseCapacity/);
});

test("shell configuration is persisted canonically and marriage/QR rules force WHITE", () => {
  assert.match(migration, /shell_type/);
  assert.match(migration, /set_event_shell_configuration/);
  assert.match(migration, /MARRIAGE_DEFAULT/);
  assert.match(migration, /QR_REQUIREMENT/);
  assert.match(migration, /'WHITE'/);
  assert.match(workspace, /Tótem físico/);
});

test("white and black shell pools are independently gated without double-counting touch", () => {
  assert.match(migration, /WHITE_SHELL_CAPACITY_EXCEEDED/);
  assert.match(migration, /BLACK_SHELL_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(migration, /TOUCH_DISPLAY.*candidate/);
});

test("preflight is attached to confirmation and does not alter existing reservations", () => {
  assert.match(migration, /before update of status/);
  assert.match(migration, /enforce_reservation_capacity_gate/);
  assert.match(migration, /new.status='CONFIRMED'/);
  assert.doesNotMatch(migration, /update public\.crm_reservations set status='CONFIRMED'/);
});
