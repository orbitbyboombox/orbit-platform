import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync('features/portal-authentication/staff-portal-dashboard.tsx', 'utf8');
const portal = readFileSync('features/portal-authentication/staff-portal.tsx', 'utf8');

test('operator extras reminder excludes transport and only displays active categories', () => {
  assert.match(dashboard, /category !== "TRASLADO" && extras\.categories\[category\]/);
  assert.match(dashboard, /RECUERDA: TU EVENTO INCLUYE/);
  assert.match(dashboard, /if \(active\.length === 0 && !photoLabel\) return null/);
});

test('operator extras reminder includes the selected photo style without showing pending as an extra', () => {
  assert.match(dashboard, /photoStyle === "COLOR" \? "FOTOS A COLOR"/);
  assert.match(dashboard, /photoStyle === "BLACK_WHITE" \? "FOTOS EN BLANCO Y NEGRO"/);
  assert.match(dashboard, /photoStyle === "SEPIA" \? "FOTOS EN SEPIA"/);
  assert.match(dashboard, /if \(active\.length === 0 && !photoLabel\) return null/);
  assert.doesNotMatch(dashboard, /photoLabel.*PENDIENTE/);
});

test('completed historical operator events also render the extras reminder', () => {
  assert.match(dashboard, /REALIZADOS · \{completed\.length\}/);
  assert.match(dashboard, /\{completed\.map\(event=>[\s\S]*?<StaffOperationalExtras extras=\{event\.operationalExtras\} photoStyle=\{event\.printInstructions\.photoStyle\} compact \/>/);
});

test('staff query includes ninety days of historical events', () => {
  assert.match(portal, /expenseStart=addDays\(start,-90\)/);
});
