import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boxesPage = readFileSync("app/(platform)/resources/boxes/page.tsx", "utf8");
const inventory = readFileSync("features/resources/box-inventory.ts", "utf8");
const master = readFileSync("features/resources/black-box-master.tsx", "utf8");

test("Issue 70 reads real paper lots and movements per box", () => {
  assert.match(inventory, /from\("box_media_lots"\)/);
  assert.match(inventory, /remaining_photo_capacity/);
  assert.match(inventory, /from\("inventory_movements"\)/);
  assert.match(inventory, /media_lot_id/);
  assert.match(inventory, /paperLotsByAsset/);
});

test("Issue 70 makes Bodega navigation and no-data states explicit", () => {
  assert.match(boxesPage, /Ver inventario Bodega y movimientos/);
  assert.match(boxesPage, /Carga Bodega → Caja: bloqueada/);
  assert.match(master, /No existe lote de papel cargado/);
  assert.match(master, /No se muestra un saldo ficticio/);
  assert.match(master, /No incluye costos financieros/);
});

test("Issue 70 keeps Bodega → Caja writes blocked", () => {
  assert.doesNotMatch(boxesPage, /insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(master, /CARGAR PAPEL|TRANSFERIR PAPEL|CARGAR A CAJA/);
});
