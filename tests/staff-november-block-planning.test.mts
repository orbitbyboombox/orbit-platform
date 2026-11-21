import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { staffAssignmentPaymentForEvent } from "../features/operations/staff-assignment-payment.ts";

const historical = [
  { code: "OPERATOR_4_5_HOURS", amount: 25500 },
  { code: "ASSEMBLY", amount: 7000 },
  { code: "DISASSEMBLY", amount: 7000 },
];

test("October 4h30 keeps the historical operator tariff", () => {
  assert.equal(staffAssignmentPaymentForEvent(historical, 4.5, "OPERATOR", "2026-10-31"), 25500);
});

test("November 4h30 applies to operator and supervisor", () => {
  assert.equal(staffAssignmentPaymentForEvent([], 4.5, "OPERATOR", "2026-11-01"), 32500);
  assert.equal(staffAssignmentPaymentForEvent([], 4.5, "SUPERVISOR", "2026-11-01"), 32500);
  assert.equal(7 * staffAssignmentPaymentForEvent([], 4.5, "OPERATOR", "2026-11-08"), 227500);
});

test("November setup roles remain independent and fixed", () => {
  assert.equal(staffAssignmentPaymentForEvent([], 4.5, "ASSEMBLY", "2026-11-08"), 10000);
  assert.equal(staffAssignmentPaymentForEvent([], 4.5, "DISASSEMBLY", "2026-11-08"), 10000);
});

test("planning exposes all four independent roles and the effective-date source", () => {
  const page = readFileSync("app/(platform)/operations/page.tsx", "utf8");
  assert.match(page, /findRole\("SUPERVISOR", "Supervisor"\)/);
  assert.match(page, /event\.roles\.supervisor/);
  assert.match(page, /staffAssignmentPaymentForEvent/);
  assert.match(page, /project\?\.event_date/);
  const staffCenter = readFileSync("features/resources/staff-operation-center.tsx", "utf8");
  assert.match(staffCenter, /value: "SUPERVISOR", label: "Supervisor"/);
});

test("database migration is additive and protects settled payments", () => {
  const migration = readFileSync("supabase/migrations/0258_staff_effective_date_rate_resolver.sql", "utf8");
  assert.match(migration, /resolve_staff_assignment_rate/);
  assert.match(migration, /p_event_date/);
  assert.match(migration, /status='PAID'/);
  assert.match(migration, /settlement_status in \('PAID','FINALIZED','ADVANCE'\)/);
  assert.match(migration, /on conflict\(block_id,staff_id,role\)/);
  assert.doesNotMatch(migration, /delete from public\.(event_staff_payments|event_staff_block_costs)/i);
});
