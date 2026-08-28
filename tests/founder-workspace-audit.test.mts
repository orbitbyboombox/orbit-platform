import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/0194_founder_workspace_audit_entity.sql", import.meta.url),
  "utf8",
);

test("Founder Workspace auditing uses its canonical user primary key", () => {
  assert.match(migration, /new_row->>'user_id'/);
  assert.match(migration, /old_row->>'user_id'/);
  assert.match(migration, /entity_id/);
  assert.match(migration, /audit_founder_workspace_change/);
});

test("the repair is audit-only and does not alter business data", () => {
  assert.doesNotMatch(migration, /payments|invoices|projects|customers|staff|expenses/i);
  assert.doesNotMatch(migration, /delete from|truncate|drop table/i);
  assert.match(migration, /drop trigger if exists founder_workspace_audit/);
});
