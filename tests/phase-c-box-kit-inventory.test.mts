import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260925090000_phase_c_box_kit_inventory_core.sql", "utf8");
const repository = readFileSync("features/resources/box-inventory.ts", "utf8");
const listPage = readFileSync("app/(platform)/resources/boxes/page.tsx", "utf8");
const detailPage = readFileSync("app/(platform)/resources/boxes/[assetId]/page.tsx", "utf8");

test("Phase C.1 keeps boxes in the canonical asset graph", () => {
  assert.match(migration, /asset_type in \(\s*'BOX'/);
  assert.match(migration, /parent_asset_id uuid references public\.operational_assets/);
  assert.match(migration, /asset_assignments_no_overlapping_window|asset_assignments/);
  assert.match(migration, /on delete set null/);
});

test("Phase C.1 inspections are explicit, auditable and RLS protected", () => {
  assert.match(migration, /create table if not exists public\.asset_assignment_inspections/);
  assert.match(migration, /CHECK_OUT/);
  assert.match(migration, /CHECK_IN/);
  assert.match(migration, /MISSING.*DAMAGED.*MAINTENANCE_REQUIRED/);
  assert.match(migration, /incident_flag boolean not null default false/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /audit_row_change/);
});

test("Phase C.1 exposes a minimal box list/detail data layer", () => {
  assert.match(repository, /asset_type.*BOX/);
  assert.match(repository, /asset_assignment_inspections/);
  assert.match(listPage, /Cajas/);
  assert.match(detailPage, /Contenido/);
  assert.match(detailPage, /Inspecciones/);
});
