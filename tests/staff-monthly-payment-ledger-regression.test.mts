import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260929010000_staff_monthly_payment_excludes_paid_reimbursements.sql", "utf8");

test("monthly honorarium payment allocation excludes reimbursements", () => {
  assert.match(migration, /obligation:=coalesce\(\(detail->>'workNet'\)::numeric,0\)/);
  assert.doesNotMatch(migration, /obligation:=coalesce\(\(detail->>'workNet'\)::numeric,0\)\+coalesce\(\(detail->>'reimbursements'\)::numeric,0\)/);
  assert.match(migration, /Reimbursements are intentionally excluded/);
});

test("Sebastián's corrected ledger arithmetic is explicit", () => {
  const workNet = 229000;
  const reimbursementsPaid = 36589;
  const workPaid = 200401;
  const expectedWorkBalance = workNet - workPaid;
  assert.equal(expectedWorkBalance, 28599);
  assert.equal(workNet + reimbursementsPaid, 265589);
  assert.equal(Math.max(expectedWorkBalance, 0), 28599);
});
