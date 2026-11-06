import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const action = readFileSync("features/operations/admin-paper-block.actions.ts","utf8");
const panel = readFileSync("features/operations/admin-paper-block-manual-panel.tsx","utf8");
const page = readFileSync("app/admin/totems/[projectId]/page.tsx","utf8");
const sql = readFileSync("supabase/migrations/20261106100000_admin_paper_block_manual_closeout.sql","utf8");

test("Founder-only manual action verifies real auth and role before privileged RPC", () => {
  assert.match(action, /client\.auth\.getUser\(\)/);
  assert.match(action, /profile\?\.role !== "CEO"/);
  assert.match(action, /admin\.rpc\("admin_record_staff_paper_block_closeout"/);
  assert.match(action, /reason\.length < 10/);
});
test("manual closeout is audited atomically and reuses canonical inventory reconciliation", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.event_paper_block_admin_audit/);
  assert.match(sql, /admin_role is distinct from 'CEO'/);
  assert.match(sql, /public\.record_staff_paper_block_closeout\(/);
  assert.match(sql, /insert into public\.event_paper_block_admin_audit/);
  assert.match(sql, /request_id uuid not null unique/);
});
test("manual controls are only in CEO protected multicase admin page", () => {
  assert.match(page, /profile\?\.role !== "CEO"/);
  assert.match(page, /AdminPaperBlockManualPanel projectId=\{projectId\}/);
  assert.match(panel, /window\.confirm/);
  assert.match(panel, /block\.canClose/);
  assert.match(panel, /CERRAR \$\{block\.blockName\.toUpperCase\(\)\} MANUALMENTE/);
});

test("manual and Staff PM openings refresh from verified AM remaining", () => {
  const staffPanel = readFileSync("features/portal-authentication/staff-paper-block-closeout-panel.tsx", "utf8");
  assert.match(panel, /opening: String\(row\.opening\)/);
  assert.match(staffPanel, /opening: block\.opening < 0 \? "" : String\(block\.opening\)/);
  assert.doesNotMatch(panel, /old\[row\.assignmentId\] \?\? \{/);
  assert.doesNotMatch(staffPanel, /current\[block\.assignmentId\] \?\? \{/);
});
