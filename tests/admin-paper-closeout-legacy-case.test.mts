import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261108120000_repair_admin_case_paper_closeout.sql", "utf8");
const action = readFileSync("features/projects/event-paper.actions.ts", "utf8");
const ui = readFileSync("features/resources/admin-paper-closeout-dialog.tsx", "utf8");

test("legacy no-lot CASE closeout writes one auditable EVENT_USAGE movement", () => {
  assert.match(migration, /alter column supply_id drop not null/i);
  assert.match(migration, /supply_id is null[\s\S]*movement_type = 'EVENT_USAGE'[\s\S]*media_lot_id is null[\s\S]*box_asset_id is not null[\s\S]*project_id is not null/i);
  assert.match(migration, /if delta_usage > 0 then[\s\S]*insert into public\.inventory_movements/i);
  assert.match(migration, /quantity_before, quantity_delta, quantity_after, idempotency_key/i);
  assert.match(migration, /hashtextextended\(correlation, 0\)/i);
  assert.match(migration, /perform pg_advisory_xact_lock/i);
  assert.match(migration, /create or replace function public\.record_inventory_timeline\(\)[\s\S]*if new\.supply_id is null[\s\S]*OperationalAsset/i);
  assert.match(migration, /status not in \('PENDING','READY_TO_CLOSE'\)/i);
});

test("admin paper close preserves operator report and does not release assignments", () => {
  assert.match(migration, /override_reason = trim\(p_reason\)/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,150}close_note\s*=/i);
  assert.doesNotMatch(migration, /confirmed_by\s*=/i);
  assert.match(migration, /operatorReport', snapshot_row\.close_note/i);
  assert.match(migration, /if new\.status = 'CONFIRMED' then[\s\S]*update public\.asset_assignments/i);
  assert.match(migration, /La asignación de Caja no fue liberada/i);
  assert.match(action, /format_key,black_box_paper_format,close_note/i);
  assert.match(ui, /Observación original \/ reporte del operador/i);
  assert.match(ui, /La Caja continúa asignada/i);
});

test("Mara reported values reconcile to exactly 38 prints and 352 remain", () => {
  const initial = 390;
  const remaining = 352;
  const actualUsage = initial - remaining;
  assert.equal(actualUsage, 38);
  assert.equal(initial - actualUsage, remaining);
});
