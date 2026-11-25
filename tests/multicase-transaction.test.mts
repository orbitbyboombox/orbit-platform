import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261125123000_transactional_multicase_admin_assignment.sql", import.meta.url), "utf8");

test("Multicaja transaction requires an authenticated administrator and is not public", () => {
  assert.match(migration, /actor uuid := auth\.uid\(\)/i);
  assert.match(migration, /not public\.can_administer\(\)/i);
  assert.match(migration, /revoke all on function public\.save_event_multicase_configuration\(uuid,jsonb\) from public,anon/i);
  assert.match(migration, /grant execute on function public\.save_event_multicase_configuration\(uuid,jsonb\) to authenticated/i);
});

test("saving links existing assignment IDs and does not recreate or cancel them", () => {
  assert.match(migration, /update public\.assignments a[\s\S]*where a\.id=any\(assignment_ids\)/i);
  assert.doesNotMatch(migration, /insert into public\.assignments/i);
  assert.doesNotMatch(migration, /status\s*=\s*'CANCELLED'/i);
  assert.match(migration, /Hay operadores activos sin caja asignada/i);
});

test("case assignment goes through the canonical availability and assignment RPC", () => {
  assert.match(migration, /public\.assign_operational_assets\(/i);
  assert.match(migration, /public\.release_operational_asset\(/i);
  assert.match(migration, /public\.recalculate_event_resource_assignments\(/i);
});

test("paper snapshots are idempotent by event and physical case", () => {
  assert.match(migration, /s\.project_id=new\.project_id and s\.box_asset_id=new\.asset_id/i);
  assert.match(migration, /No se cambió la caja/i);
  assert.doesNotMatch(migration, /update public\.event_paper_snapshots\s+set\s+opening_balance/i);
});

test("preventive audit covers only current and future open events", () => {
  assert.match(migration, /p\.event_date >= timezone\('America\/Santiago',now\(\)\)::date/i);
  assert.match(migration, /OPERATOR_BLOCK_MISSING/);
  assert.match(migration, /OPERATOR_BOX_MISSING/);
  assert.match(migration, /CASE_INVENTORY_UNLINKED/);
  assert.match(migration, /CASE_REQUIREMENT_UNFILLED/);
});
