import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const master = readFileSync("features/resources/black-box-master.tsx", "utf8");
const loader = readFileSync("features/resources/box-inventory.ts", "utf8");
const history = readFileSync("app/(platform)/resources/boxes/[assetId]/history/page.tsx", "utf8");

test("Cajas main view exposes compact history navigation per box", () => {
  assert.match(master, /href=\{`\/resources\/boxes\/\$\{box\.id\}\/history`\}/);
  assert.match(master, /Ver historial/);
  assert.match(master, /Historial de eventos/);
  assert.doesNotMatch(master, /box\.assignments\.map\(\(assignment\) => <div className=\"text-sm\"/);
});

test("box history is a read-only independent view ordered by operational history", () => {
  assert.match(loader, /export async function loadBoxHistory/);
  assert.match(loader, /event_paper_snapshots/);
  assert.match(loader, /order\("planned_start_at", \{ ascending: false \}\)/);
  assert.match(history, /← Volver a Cajas/);
  assert.match(history, /Saldo maestro actual/);
  assert.match(history, /events\.map/);
  assert.match(history, /assignment\.id/);
  assert.match(history, /snapshot\.status/);
});
