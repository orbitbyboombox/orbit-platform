import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("features/asset-management/event-box-operations-panel.tsx", "utf8");
const action = readFileSync("features/asset-management/event-box-operations.actions.ts", "utf8");
const dialog = readFileSync("features/resources/admin-paper-closeout-dialog.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261008123000_admin_force_staff_paper_closeout.sql", "utf8");

test("Event 360 exposes the manual paper closeout only for pending snapshots", () => {
  assert.match(panel, /AdminPaperCloseoutDialog/);
  assert.match(panel, /!closed/);
  assert.match(panel, /paperSnapshot/);
  assert.match(action, /event_paper_snapshots/);
  assert.match(dialog, /CERRAR PAPEL MANUALMENTE/);
});

test("the administrative closeout remains authorized, atomic, and idempotent", () => {
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /inventory_movements/);
  assert.match(migration, /status = 'OVERRIDDEN'/);
  assert.match(migration, /correlation_id = correlation/);
  assert.match(migration, /master_asset_version_after/);
});
