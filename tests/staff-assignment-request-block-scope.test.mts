import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921230500_staff_assignment_request_block_scope.sql", import.meta.url),
  "utf8",
);

test("staff assignment request block scope is additive and legacy-safe", () => {
  assert.match(migration, /add column if not exists block_id uuid/i);
  assert.match(migration, /references public\.event_operational_blocks\(id\)\s+on delete restrict/i);
  assert.match(migration, /staff_assignment_requests_block_idx/i);
  assert.doesNotMatch(migration, /drop table|drop column/i);
});
