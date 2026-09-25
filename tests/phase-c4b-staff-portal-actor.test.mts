import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260925230000_phase_c4b_staff_portal_actor_reconcile.sql", "utf8");
const boxActions = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");
const consumableActions = readFileSync("features/portal-authentication/staff-consumables.actions.ts", "utf8");

test("C.4B uses the canonical Staff Portal session as the mutation boundary", () => {
  assert.match(boxActions, /loadPortalSession\("STAFF"\)/);
  assert.match(consumableActions, /loadPortalSession\("STAFF"\)/);
  assert.match(boxActions, /p_portal_session_id: portalSessionId/);
  assert.match(consumableActions, /p_portal_session_id: portalSessionId/);
  assert.match(migration, /resolve_phase_c_staff_portal_actor/);
  assert.match(migration, /pas\.access_type='STAFF'/);
  assert.match(migration, /pas\.expires_at>now\(\)/);
  assert.match(migration, /pas\.revoked_at is null/);
  assert.match(migration, /s\.portal_enabled=true/);
  assert.match(migration, /s\.status='ACTIVE'/);
});

test("C.4B records an operational Staff actor without manufacturing profile identity", () => {
  assert.match(migration, /add column if not exists staff_id uuid references public\.staff\(id\)/);
  assert.match(migration, /add column if not exists portal_session_id uuid references public\.portal_access_sessions\(id\)/);
  assert.match(migration, /created_by drop not null/);
  assert.match(migration, /staff_id,portal_session_id/);
  assert.match(migration, /actor_profile_id/);
  assert.match(migration, /revoke all on function public\.record_staff_box_check_out\(uuid,uuid,jsonb,text,uuid\) from public,anon,authenticated,service_role/);
});

test("C.4B preserves the certified assignment role boundary", () => {
  assert.match(migration, /assignment_type in\('OPERATOR','ASSEMBLY'\)/);
  assert.match(migration, /assignment_type in\('OPERATOR','DISASSEMBLY'\)/);
  assert.match(migration, /Staff no autorizado para CHECK_OUT/);
  assert.match(migration, /Staff no autorizado para CHECK_IN/);
});
