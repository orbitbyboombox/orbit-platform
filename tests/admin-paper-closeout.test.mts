import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261008123000_admin_force_staff_paper_closeout.sql", "utf8");
const action = readFileSync("features/projects/event-paper.actions.ts", "utf8");
const ui = readFileSync("features/resources/admin-paper-closeout-dialog.tsx", "utf8");
const historyActions = readFileSync("features/resources/box-history-event-actions.tsx", "utf8");

test("admin paper closeout is Founder/Admin-only, atomic and idempotent", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.can_administer\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /next_stock < 0/);
  assert.match(migration, /staff-paper-admin-close:/);
  assert.match(migration, /status = 'OVERRIDDEN'/);
  assert.match(migration, /inventory_movements/);
  assert.match(migration, /timeline_events/);
  assert.match(migration, /grant execute on function public\.admin_force_staff_event_paper_closeout\(uuid,uuid,numeric,text,text\) to authenticated/);
  assert.match(migration, /revoke all on function public\.admin_force_staff_event_paper_closeout/);
});

test("admin closeout action uses the canonical RPC and revalidates Cajas", () => {
  assert.match(action, /admin_force_staff_event_paper_closeout/);
  assert.match(action, /revalidatePath\("\/resources\/boxes"\)/);
  assert.match(action, /isAdministrativeRole/);
});

test("Logística Cajas exposes the controlled administrative closeout", () => {
  assert.match(historyActions, /AdminPaperCloseoutDialog/);
  assert.match(ui, /FORZAR CIERRE DE EVENTO/);
  assert.match(ui, /Motivo obligatorio/);
  assert.match(ui, /CONFIRMAR CIERRE/);
  assert.match(ui, /Papel final real/);
});
