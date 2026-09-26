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
  assert.match(view, /grid w-full max-w-full min-w-0 grid-cols-2 gap-2 rounded-2xl/);
  assert.match(view, /GENERAR RUTA/);
});

test("Staff logistics mobile rows restore the desktop preview row with left-aligned scaling", () => {
  assert.match(view, /function LogisticsEventRow/);
  assert.match(view, /<LogisticsEventRow event=\{event\} sector=\{sectorForCommune\(event\.commune, overrides\)\}/);
  assert.match(view, /<ScaledLogisticsEventRow event=\{event\} sector=\{sectorForCommune\(event\.commune, overrides\)\}/);
  assert.match(view, /LOGICAL_ROW_WIDTH_PX = 680/);
  assert.match(view, /LOGICAL_ROW_HEIGHT_PX = 112/);
  assert.match(view, /naturalHeight/);
  assert.match(view, /querySelector\("button"\)/);
  assert.match(view, /ResizeObserver/);
  assert.match(view, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(view, /origin-top-left/);
  assert.doesNotMatch(view, /ml-\[calc\(50%-50vw\+12px\)\]/);
  assert.doesNotMatch(view, /w-\[calc\(100vw-24px\)\]/);
  assert.doesNotMatch(view, /translateX\(/);
  assert.doesNotMatch(view, /marginLeft: "calc\(50% - 50vw \+ 12px\)"/);
  assert.match(view, /filtersWrapperRef/);
  assert.match(view, /eventListWrapperRef/);
  assert.match(view, /filters: \{ left: filtersRect\.left, right: filtersRect\.right, width: filtersRect\.width \}/);
  assert.match(view, /list: \{ left: listRect\.left, right: listRect\.right, width: listRect\.width \}/);
  assert.match(view, /className="relative w-full max-w-full min-w-0 overflow-visible" style=\{\{ left: "-100px" \}\}/);
  assert.doesNotMatch(view, /translateX\(-220px\)/);
  assert.doesNotMatch(view, /left: "-(?:1[5-9]\d|2\d\d)px"/);
  assert.match(view, /getBoundingClientRect\(\)/);
  assert.match(view, /grid-cols-\[72px_5px_96px_minmax\(0,1\.25fr\)_minmax\(0,1fr\)_110px_auto_20px\]/);
  assert.match(view, /w-full max-w-full min-w-0/);
  assert.match(view, /event\.customer/);
  assert.match(view, /event\.location/);
  assert.match(view, /event\.service/);
  assert.match(view, /ChevronRight/);
  assert.doesNotMatch(view, /LogisticsMobileCard/);
  assert.doesNotMatch(view, /mobileCompact/);
});
