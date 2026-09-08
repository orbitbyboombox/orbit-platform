import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0245_fix_staff_payment_receipt_month.sql", "utf8");
const action = readFileSync("features/staff-monthly-account/actions.ts", "utf8");

test("payment receipt uses the canonical YYYY-MM settlement month", () => {
  assert.match(migration, /to_char\(item\.accounting_month,'YYYY-MM'\)/);
  assert.doesNotMatch(migration, /values\([^;]*item\.accounting_month,'Comprobante de pago Staff'/);
});

test("August and year rollover retain calendar-month semantics", () => {
  assert.match(migration, /YYYY-MM/);
  assert.match(action, /monthlyReceiptPath\(\s*staffId,\s*month/);
});

test("payment remains idempotent and does not duplicate receipt or ledger movement", () => {
  assert.match(migration, /payment_idempotency_key=p_idempotency_key/);
  assert.match(migration, /on conflict\(legacy_source\) do nothing/);
});

test("invalid month is still rejected by the strict document constraint", () => {
  const constraint = readFileSync("supabase/migrations/0160_staff_document_center.sql", "utf8");
  assert.match(constraint, /applicable_month is null or applicable_month ~ '\^\[0-9\]\{4\}-/);
});
