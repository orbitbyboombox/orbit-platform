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

test("Staff logistics keeps date navigation together and exposes the primary controls", () => {
  assert.match(view, /aria-label="Navegación de rango de fechas"/);
  assert.match(view, /AGRUPAR POR SECTOR/);
  assert.match(view, /GENERAR RUTA/);
  assert.match(view, /Más opciones de logística/);
});

test("Staff logistics detail exposes commune and mapped sector", () => {
  assert.match(view, /DetailItem label="COMUNA"/);
  assert.match(view, /DetailItem label="SECTOR"/);
  assert.match(view, /sectorForCommune\(event\.commune, overrides\)/);
});

test("Staff logistics starts from the current Chile week, never the first event", () => {
  assert.match(view, /CHILE_TIME_ZONE = "America\/Santiago"/);
  assert.match(view, /export const chileTodayIso/);
  assert.match(view, /export const chileCurrentWeek/);
  assert.match(view, /useState\(\(\) => dateOnly\(chileCurrentWeek\(\)\.start\)\)/);
  assert.doesNotMatch(view, /useState\(\(\) => monday\(events\[0\]/);
});

test("Staff logistics has a compact mobile week label and contained controls", () => {
  assert.match(view, /compactWeekLabel/);
  assert.match(view, /sm:hidden/);
  assert.match(view, /AGRUPAR POR SECTOR/);
  assert.match(view, /grid grid-cols-2 gap-2 rounded-2xl/);
  assert.match(view, /GENERAR RUTA/);
});

test("Staff logistics mobile cards use an integrated date tile without a horizontal status bar", () => {
  assert.match(view, /grid-cols-\[54px_4px_minmax\(0,1fr\)_16px\]/);
  assert.match(view, /h-14 w-1 rounded-full/);
  assert.match(view, /date\.weekday/);
  assert.match(view, /event\.operator.*event\.box/);
  assert.match(view, /state\.color/);
  assert.match(view, /max-w-16.*rounded-full/);
  assert.match(view, /event\.customer.*event\.location/);
  assert.doesNotMatch(view, /function LogisticsMobileCard[\s\S]*border-r-4/);
});
