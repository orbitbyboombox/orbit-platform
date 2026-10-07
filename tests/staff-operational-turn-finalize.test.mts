import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rpc = readFileSync("supabase/migrations/20261007120000_add_staff_operational_turn_finalize.sql", "utf8");
const action = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");
const panel = readFileSync("features/portal-authentication/staff-box-operations-panel.tsx", "utf8");

test("operational turn finalization is scoped to the own operator block", () => {
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /staff_id=p_staff_id/);
  assert.match(rpc, /assignment_type='OPERATOR'/);
  assert.match(rpc, /block_id=p_block_id/);
  assert.match(rpc, /status='COMPLETED'/);
  assert.match(rpc, /duplicate',true/);
  assert.doesNotMatch(rpc, /update public\.(operational_assets|event_paper_snapshots|asset_assignments)/);
  assert.doesNotMatch(rpc, /event_staff_payments/);
});

test("Staff UI exposes an idempotent own-turn action and no global close action", () => {
  assert.match(action, /finalize_staff_operational_turn/);
  assert.match(action, /p_assignment_id/);
  assert.match(action, /p_block_id/);
  assert.match(panel, /FINALIZAR MI TURNO/);
  assert.match(panel, /TURNO FINALIZADO/);
  assert.doesNotMatch(panel, /LIBERAR CAJA/);
});
