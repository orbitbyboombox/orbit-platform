import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0241_event_physical_configuration.sql", "utf8");
const panel = readFileSync("features/asset-management/equipment-assignment-panel.tsx", "utf8");

test("physical configuration is a single canonical project-level value", () => {
  assert.match(migration, /operations=coalesce\(operations/);
  for (const value of ["WHITE_TOTEM", "BLACK_TOTEM", "BBOX360_PLATFORM", "IA43_INTEGRATED", "UNDEFINED"]) assert.match(migration, new RegExp(value));
});
test("white and black configurations generate distinct physical requirements", () => {
  assert.match(migration, /WHITE_TOTEM:TOTEM/);
  assert.match(migration, /WHITE_TOTEM:DISPLAY_22/);
  assert.match(migration, /BLACK_TOTEM:TOTEM/);
  assert.doesNotMatch(migration, /WHITE_TOTEM:.*TOUCH/);
});
test("BBOX360 uses its platform and never adds CASE", () => {
  assert.match(migration, /BBOX360_PLATFORM:BBOX360/);
  assert.doesNotMatch(migration, /BBOX360_PLATFORM:CASE/);
});
test("configuration selector is exposed in Event Workspace", () => {
  assert.match(panel, /Configuración física/);
  assert.match(panel, /setPhysicalConfigurationAction/);
  assert.match(panel, /IA43_INTEGRATED/);
});
test("configuration reconciliation is idempotent and non-destructive", () => {
  assert.match(migration, /on conflict\(project_id,canonical_key\)/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});
