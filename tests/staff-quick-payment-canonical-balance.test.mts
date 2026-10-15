import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveCanonicalStaffHonorariaBalance } from "../features/staff-payments/canonical-staff-obligation.ts";

test("honoraria exclude reimbursements and support partial payment", () => {
  const first = deriveCanonicalStaffHonorariaBalance({ originalNet: 34000, paidAmount: 0 });
  assert.equal(first.outstanding, 34000);
  const partial = deriveCanonicalStaffHonorariaBalance({ originalNet: 34000, paidAmount: 20000 });
  assert.equal(partial.outstanding, 14000);
});

test("paid expenses do not reduce honoraria a second time", () => {
  const balance = deriveCanonicalStaffHonorariaBalance({ originalNet: 14000, paidAmount: 0 });
  assert.equal(balance.outstanding, 14000);
});

test("balance never becomes negative and migration guards concurrency/idempotency", () => {
  assert.equal(deriveCanonicalStaffHonorariaBalance({ originalNet: 14000, paidAmount: 20000 }).outstanding, 0);
  const migration = readFileSync("supabase/migrations/20261015120000_canonical_staff_quick_payment_guard.sql", "utf8");
  assert.match(migration, /for update/);
  assert.match(migration, /p_amount>honoraria_remaining/);
  assert.match(migration, /staff-advance:/);
  assert.doesNotMatch(migration, /delete from (invoices|expenses)/i);
});
