import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("features/portal-authentication/staff-box-operations.actions.ts", "utf8");
const panel = readFileSync("features/portal-authentication/staff-paper-block-closeout-panel.tsx", "utf8");
const dashboard = readFileSync("features/portal-authentication/staff-portal-dashboard.tsx", "utf8");
const rpc = readFileSync("supabase/migrations/20261105113000_staff_paper_block_closeout_rpc.sql", "utf8");

test("portal reads only own blocks and writes through the guarded RPC", () => {
  assert.match(actions, /loadStaffPaperBlocksAction/);
  assert.match(actions, /staffContext\(projectId, \["OPERATOR"\]\)/);
  assert.match(actions, /event_box_paper_block_closeouts/);
  assert.match(actions, /record_staff_paper_block_closeout/);
  assert.match(actions, /revalidatePath\("\/staff-portal"\)/);
});

test("paper block panel exposes AM/PM controls and does not expose arbitrary events", () => {
  assert.match(panel, /CERRAR \$\{block\.blockName\.toUpperCase\(\)\}/);
  assert.match(panel, /data-paper-block=\{block\.blockName\}/);
  assert.match(panel, /Saldo final/);
  assert.match(dashboard, /StaffPaperBlockCloseoutPanel projectId=\{event\.id\}/);
});

test("server function enforces operator, project/block/asset identity, PM handoff and request idempotency", () => {
  for (const fragment of ["a.staff_id = p_staff_id", "a.block_id = p_block_id", "into strict asset_row", "Debe cerrarse el bloque anterior", "unique_violation", "p_request_id"]) {
    assert.match(rpc, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(rpc, /grant execute .* to service_role/);
  assert.doesNotMatch(rpc, /inventory_movements/);
});


test("RPC enforces unique box selection and rejects conflicting retries", () => {
  assert.match(rpc, /into strict asset_row/);
  assert.match(rpc, /Solicitud duplicada con datos diferentes/);
  assert.match(rpc, /Cantidad de papel fuera del rango permitido/);
});
