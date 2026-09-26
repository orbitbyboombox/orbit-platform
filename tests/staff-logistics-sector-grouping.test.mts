import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const view = readFileSync("features/resources/staff-logistics-view.tsx", "utf8");

test("Staff logistics keeps sector grouping as a simple visual projection", () => {
  assert.match(view, /DEFAULT_COMMUNE_SECTOR_MAP/);
  assert.match(view, /AGRUPAR POR SECTOR/);
  assert.match(view, /SECTOR \{sector\}/);
  assert.match(view, /Ordenar por/);
  assert.match(view, /ASSEMBLY.*Montaje/);
  assert.match(view, /DISASSEMBLY.*Desmontaje/);
  assert.match(view, /SectorMappingEditor/);
});

test("Staff logistics rows retain operational time windows", () => {
  assert.match(view, /formatTime\(event\.setupTime\)/);
  assert.match(view, /formatTime\(event\.teardownTime\)/);
  assert.match(view, /formatTime\(event\.endTime\)/);
});
