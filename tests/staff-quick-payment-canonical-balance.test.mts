import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveCanonicalStaffHonorariaBalance } from "../features/staff-payments/canonical-staff-obligation.ts";

test("quick payment excludes reimbursements from the honoraria balance", () => {
  const result = deriveCanonicalStaffHonorariaBalance({
    originalNet: 34_000,
    adjustmentTotal: 0,
    paidAmount: 0,
  });
  assert.deepEqual(result, { gross: 34_000, paid: 0, outstanding: 34_000 });
});

test("partial honoraria payment leaves the canonical remainder", () => {
  const result = deriveCanonicalStaffHonorariaBalance({
    originalNet: 34_000,
    paidAmount: 20_000,
  });
  assert.equal(result.outstanding, 14_000);
});

test("paid reimbursements do not reduce honoraria twice", () => {
  const result = deriveCanonicalStaffHonorariaBalance({
    originalNet: 14_000,
    paidAmount: 0,
  });
  assert.equal(result.outstanding, 14_000);
});

test("overpayment cannot produce a negative balance", () => {
  const result = deriveCanonicalStaffHonorariaBalance({
    originalNet: 14_000,
    paidAmount: 20_000,
  });
  assert.equal(result.outstanding, 0);
});

test("the database guard locks the settlement and preserves idempotency", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261015120000_canonical_staff_quick_payment_guard.sql"), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /p_amount>honoraria_remaining/);
  assert.match(sql, /legacy_source='staff-advance:'\|\|p_idempotency_key/);
  assert.doesNotMatch(sql, /update public\.(invoices|payments)|delete from public\.(expenses|event_staff_payments)/i);
});
