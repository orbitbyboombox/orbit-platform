import assert from "node:assert/strict";
import test from "node:test";
import { getLowBoxPaperAlerts } from "../../src/lib/paper-inventory/alerts.ts";
import { inventoryKey } from "../../src/lib/paper-inventory/domain.ts";

test("alert only below 100, with exact box number", () => {
  const alerts = getLowBoxPaperAlerts({
    [inventoryKey("box:2", "PHOTO_10X15_NORMAL")]: 99,
    [inventoryKey("box:5", "PHOTO_5X15")]: 100,
    [inventoryKey("box:8", "PHOTO_10X15_PRECUT")]: 0,
    [inventoryKey("warehouse", "PHOTO_10X15_NORMAL")]: 50,
  });
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].message, "Falta cargar papel de bodega a caja número 8");
  assert.equal(alerts[1].message, "Falta cargar papel de bodega a caja número 2");
});
