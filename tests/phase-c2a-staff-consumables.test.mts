import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260925110000_phase_c2a_staff_media_return.sql", "utf8");
const action = readFileSync("features/portal-authentication/staff-consumables.actions.ts", "utf8");
const panel = readFileSync("features/portal-authentication/staff-consumables-panel.tsx", "utf8");

test("Staff read contract exposes box, printer, format, lot, load date and balance", () => {
  for (const field of ["boxCode", "printerCode", "formatKey", "lot", "loadedAt", "remaining"]) assert.match(action, new RegExp(field));
  assert.match(panel, /fotos disponibles/);
});

test("Staff return is canonical EVENT_USAGE and links the assignment actor", () => {
  assert.match(migration, /'EVENT_USAGE'/);
  assert.match(migration, /asset_assignment_inspections/);
  assert.match(migration, /p_staff_id/);
  assert.match(action, /record_staff_box_media_return/);
});

test("Staff return rejects impossible balances", () => {
  assert.match(migration, /Return count cannot be negative/);
  assert.match(migration, /Return count cannot exceed checkout balance/);
  assert.match(panel, /type="number"/);
});

test("Staff return is idempotent and does not expose admin controls", () => {
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /duplicate/);
  assert.doesNotMatch(panel, /MANUAL_ADJUSTMENT|DISCARD|LOAD/);
});

test("Staff low stock and incident reporting are visible", () => {
  assert.match(panel, /LOW STOCK/);
  assert.match(panel, /EMPTY/);
  assert.match(panel, /problema de papel\/impresora/);
  assert.match(action, /incident/);
});
