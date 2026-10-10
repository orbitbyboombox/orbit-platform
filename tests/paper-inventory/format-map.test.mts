import assert from "node:assert/strict";
import test from "node:test";
import { getOrbitFormatKey, isWarehousePaperSku, WAREHOUSE_PAPER_SKUS } from "../../src/lib/paper-inventory/format-map.ts";

test("normal and precut remain separate stock SKUs mapped to existing 10x15 catalog", () => {
  assert.notEqual("PHOTO_10X15_NORMAL", "PHOTO_10X15_PRECUT");
  assert.equal(getOrbitFormatKey("PHOTO_10X15_NORMAL"), "PHOTO_10X15");
  assert.equal(getOrbitFormatKey("PHOTO_10X15_PRECUT"), "PHOTO_10X15");
});

test("rejects unknown formats and supports all known existing catalog formats", () => {
  assert.equal(isWarehousePaperSku("unknown"), false);
  assert.equal(Object.keys(WAREHOUSE_PAPER_SKUS).length, 4);
  assert.equal(getOrbitFormatKey("PHOTO_5X15"), "PHOTO_5X15");
});
