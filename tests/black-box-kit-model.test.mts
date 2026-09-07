import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0232_black_box_kit_commercial_model.sql", "utf8");
const ui = readFileSync("features/resources/equipment-operation-center.tsx", "utf8");
const mappingUi = readFileSync("features/resources/service-asset-mapping.tsx", "utf8");

test("four services map canonically to one CASE kit", () => {
  for (const code of ["CLASSIC", "POLAROID", "BLACK_STUDIO", "INSTABOX"]) assert.match(migration, new RegExp(code));
  assert.match(migration, /asset_type='CASE'/);
});

test("non-CASE services remain outside the kit mapping", () => {
  for (const code of ["BBOX360", "BOOMBALL", "LIGHTBOX", "IA43"]) assert.doesNotMatch(migration, new RegExp(code + ".*CASE"));
});

test("white configuration does not create a second touch requirement", () => {
  assert.doesNotMatch(migration, /TOUCH_DISPLAY.*required/);
  assert.match(migration, /DISPLAY22-01/);
  assert.match(migration, /DISPLAY22-06/);
});

test("touch backup and IA equipment are not created as available stock", () => {
  assert.doesNotMatch(migration, /TOUCH185/);
  assert.doesNotMatch(migration, /IA43/);
  assert.match(migration, /360-01/);
  assert.match(migration, /360-02/);
});

test("CASE and display labels remain canonical and distinct", () => {
  assert.match(ui, /Caja Negra BOOMBOX/);
  assert.match(ui, /DISPLAY_22/);
  assert.match(mappingUi, /CASE/);
});

test("migration is idempotent and non-destructive", () => {
  assert.match(migration, /where not exists/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

