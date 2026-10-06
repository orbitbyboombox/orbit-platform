import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261006090000_staff_operational_block_operator_slots.sql", "utf8");
const page = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");

test("operational blocks materialize canonical operator requirements idempotently", () => {
  assert.match(migration, /ensure_event_operational_block_staff_requirements/);
  assert.match(migration, /on conflict \(project_id, block_id, role\) where block_id is not null/i);
  assert.match(migration, /create trigger event_operational_block_operator_slot/);
  assert.match(migration, /perform public\.ensure_event_operational_block_staff_requirements\(p_project_id, true\)/);
});

test("segmented events use block requirements instead of the legacy event operator card", () => {
  assert.match(page, /operationalBlockRows\?\.length && item\.role === "OPERATOR"/);
  assert.match(page, /blockRequirements:/);
});

test("Staff reads and displays only the assigned operator blocks", () => {
  assert.match(portal, /block_id,event_operational_blocks\(id,name,start_at,end_at\)/);
  assert.match(portal, /operationalBlocks:item\.operationalBlocks/);
  assert.match(dashboard, /TURNOS DE OPERADOR/);
});
