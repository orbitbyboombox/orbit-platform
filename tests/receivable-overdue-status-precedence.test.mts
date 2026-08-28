import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/0195_receivable_overdue_status_precedence.sql",
  "utf8",
);

test("past-due positive balances are overdue before partial-payment classification", () => {
  const overdue = migration.indexOf("then 'OVERDUE'");
  const partial = migration.indexOf("then 'PARTIALLY_PAID'");

  assert.ok(overdue > 0);
  assert.ok(partial > overdue);
  assert.match(migration, /i\.amount-i\.paid_amount>0 then 'OVERDUE'/);
});

test("paid and draft states retain precedence over overdue", () => {
  const paid = migration.indexOf("then 'PAID'");
  const draft = migration.indexOf("then 'DRAFT'");
  const overdue = migration.indexOf("then 'OVERDUE'");

  assert.ok(paid > 0 && draft > paid && overdue > draft);
});

test("receivable date projection uses the canonical Chile business day", () => {
  assert.match(
    migration,
    /timezone\('America\/Santiago',now\(\)\)::date/g,
  );
  assert.doesNotMatch(migration, /due_date<current_date/);
});

test("repair is read-model only and preserves the payment ledger", () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:invoices|invoice_payments|receivable_movements)/i,
  );
  assert.match(migration, /create or replace view public\.accounts_receivable_history/);
});

test("view replacement preserves the established public column order", () => {
  assert.doesNotMatch(migration, /\bi\.\*/);
  assert.match(
    migration,
    /i\.archived_by,\s+greatest\(i\.amount-i\.paid_amount,0\)/,
  );
  assert.doesNotMatch(migration, /drop view|cascade/i);
});
