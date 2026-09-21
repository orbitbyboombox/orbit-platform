import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = process.cwd();

test("staff audit history query is indexed and the platform shell does not reconcile on navigation", () => {
  const migration = readFileSync(`${root}/supabase/migrations/20260921193000_staff_audit_events_query_index.sql`, "utf8");
  const layout = readFileSync(`${root}/app/(platform)/layout.tsx`, "utf8");
  const actionCenter = readFileSync(`${root}/features/founder-action-center/index.ts`, "utf8");

  assert.match(migration, /audit_events_staff_entity_time_idx/);
  assert.match(migration, /where entity_type = 'staff'/i);
  assert.doesNotMatch(layout, /synchronizeModuleCatalog\(client,user\.id\)/);
  assert.match(actionCenter, /The shell only needs a badge count/);
  assert.match(actionCenter, /count:\s*"exact"/);
});
