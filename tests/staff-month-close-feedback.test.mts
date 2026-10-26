import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [center, actions, migration] = await Promise.all([
  readFile(new URL("../features/staff-payments/staff-payments-center.tsx", import.meta.url), "utf8"),
  readFile(new URL("../features/staff-monthly-account/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/0255_staff_monthly_boleta_requests.sql", import.meta.url), "utf8"),
]);

assert.match(center, /Cerrar mes y solicitar boletas/);
assert.match(center, /Cerrar mes definitivo/);
assert.match(actions, /prepareStaffMonthCloseAction/);
assert.match(actions, /finalize_staff_monthly_account/);
assert.match(actions, /createStaffMonthlySettlementPdf/);
assert.match(actions, /claim_staff_monthly_boleta_request/);
assert.match(actions, /idempotencyKey/);
assert.match(migration, /unique\(account_id\)/);
assert.match(migration, /lease_expires_at/);
assert.match(migration, /complete_staff_monthly_boleta_request/);
assert.match(migration, /if not public\.can_administer\(\)/);

console.log("staff-month-close-feedback: PASS");
