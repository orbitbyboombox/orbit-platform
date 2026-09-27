import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260927170000_staff_reimbursement_zero_defaults.sql", import.meta.url), "utf8");

test("monthly accounts with no reimbursements never write null numeric fields", () => {
  assert.match(migration, /coalesce\(sum\(coalesce\(financial\.reimbursement_total,0\)\),0\)/);
  assert.match(migration, /coalesce\(sum\(coalesce\(financial\.reimbursement_paid_amount,0\)\),0\)/);
  assert.match(migration, /coalesce\(sum\(coalesce\(financial\.reimbursement_pending_amount,0\)\),0\)/);
  assert.match(migration, /'reimbursementsPaidTotal',coalesce\(reimbursement_paid,0\)/);
  assert.match(migration, /'reimbursementsPendingTotal',coalesce\(reimbursement_pending,0\)/);
  assert.match(migration, /reimbursements_paid_total=coalesce\(reimbursements_paid_total,0\)/);
  assert.match(migration, /reimbursements_pending_total=coalesce\(reimbursements_pending_total,0\)/);
});
