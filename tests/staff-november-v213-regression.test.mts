import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  effectiveStaffAssignmentPayment,
  officialStaffAssignmentPayment,
} from "../features/operations/staff-assignment-payment.ts";

const rates = [
  { code: "OPERATOR_4_HOURS", amount: 24_000 },
  { code: "OPERATOR_5_HOURS", amount: 27_000 },
  { code: "ASSEMBLY", amount: 10_000 },
  { code: "DISASSEMBLY", amount: 10_000 },
];

test("November 4h30 operator and supervisor use the effective tariff", () => {
  assert.equal(effectiveStaffAssignmentPayment(rates, 4.5, "OPERATOR", "2026-11-08"), 32_500);
  assert.equal(effectiveStaffAssignmentPayment(rates, 4.5, "SUPERVISOR", "2026-11-08"), 32_500);
});

test("historical October events keep the legacy tariff", () => {
  assert.equal(effectiveStaffAssignmentPayment(rates, 4, "OPERATOR", "2026-10-31"), 24_000);
  assert.equal(officialStaffAssignmentPayment(rates, 4, "SUPERVISOR"), 24_000);
});

test("November assembly and disassembly are independent 10,000 roles", () => {
  assert.equal(effectiveStaffAssignmentPayment(rates, 4.5, "ASSEMBLY", "2026-11-08"), 10_000);
  assert.equal(effectiveStaffAssignmentPayment(rates, 4.5, "DISASSEMBLY", "2026-11-08"), 10_000);
});

test("migration is additive and protects settled snapshots", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261029130000_staff_november_effective_rates.sql", import.meta.url), "utf8");
  assert.match(sql, /staff_rate_effective_20261101/);
  assert.match(sql, /SUPERVISOR/);
  assert.match(sql, /settlement_status in \('PAID','FINALIZED','ADVANCE'\)/);
  assert.doesNotMatch(sql, /drop table|delete from public\.(assignments|event_staff_payments)/i);
});
