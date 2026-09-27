import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260927100000_phase4_staff_event_paper_closeout.sql", "utf8");
const panel = readFileSync("features/portal-authentication/staff-box-operations-panel.tsx", "utf8");
const actions = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");

test("Phase 4 closes paper atomically against the active Master case", () => {
  for (const marker of ["master_asset_version_before", "master_asset_version_after", "master_stock_before", "master_stock_after", "EVENT_PAPER_CLOSEOUT", "STAFF_PAPER_CLOSEOUT", "assignment_status='ASSIGNED'", "assignment_row.asset_id is distinct from snapshot_row.box_asset_id", "version=asset_row.version", "blackBoxPhotoStock", "status='CONFIRMED'"]) assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /p_final_remaining<>trunc\(p_final_remaining\)/);
  assert.match(migration, /p_final_remaining>expected_balance/);
  assert.match(migration, /Solo el Operador asignado puede cerrar el papel/);
});

test("Phase 4 gives the assigned operator a guarded mobile closeout flow", () => {
  for (const marker of ["operatorCloseoutEnabled", "FINALIZAR EVENTO", "Papel restante", "Papel utilizado", "papel de repuesto"]) assert.match(panel, new RegExp(marker));
  assert.match(actions, /staffContext\(input\.projectId, \["OPERATOR"\]\)/);
  assert.match(actions, /event_paper_snapshots/);
  assert.match(actions, /black_box_paper_format/);
});
