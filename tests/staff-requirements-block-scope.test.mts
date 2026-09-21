import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260922100000_staff_requirements_block_scope.sql", "utf8");
const upsertMigration = readFileSync("supabase/migrations/20260922100500_staff_requirement_upsert_scope.sql", "utf8");

test("staff requirements use independent event and block scopes", () => {
  assert.match(migration, /drop constraint if exists event_staff_requirements_project_id_role_key/);
  assert.match(migration, /unique index if not exists event_staff_requirements_event_scope_uidx[\s\S]*where block_id is null/i);
  assert.match(migration, /unique index if not exists event_staff_requirements_block_scope_uidx[\s\S]*where block_id is not null/i);
  assert.match(migration, /STAFF_REQUIREMENT_DUPLICATES_PRESENT/);
});

test("legacy and block upserts have explicit conflict scopes", () => {
  assert.match(migration, /on conflict\(project_id,role\) where block_id is null/);
  assert.match(migration, /on conflict\(project_id,block_id,role\) where block_id is not null/);
  assert.match(upsertMigration, /on conflict\(project_id,role\) where block_id is null/);
});

test("block UI reads block_id and renders per-block requirements", () => {
  const page = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
  const action = readFileSync("features/operations/operations-planning.actions.ts", "utf8");
  const center = readFileSync("features/staff-assignment-center/staff-assignment-center.tsx", "utf8");
  assert.match(page, /required_quantity,published,block_id/);
  assert.match(page, /blockRequirements/);
  assert.match(action, /p_block_id:blockId/);
  assert.match(center, /Planificación por bloques/);
});
