import assert from "node:assert/strict";
import test from "node:test";
import { buildPaperStockReport } from "../../src/lib/paper-inventory/stock-report.ts";
import type { PaperMovement } from "../../src/lib/paper-inventory/domain.ts";

const movements: PaperMovement[] = [
  { id: "1", idempotencyKey: "1", kind: "opening", quantity: 1400, to: "warehouse", format: "PHOTO_10X15_NORMAL", occurredAt: "2026-10-09T01:00:00Z" },
  { id: "2", idempotencyKey: "2", kind: "opening", quantity: 700, to: "warehouse", format: "PHOTO_10X15_PRECUT", occurredAt: "2026-10-09T02:00:00Z" },
  { id: "3", idempotencyKey: "3", kind: "transfer", quantity: 500, from: "warehouse", to: "box:2", format: "PHOTO_10X15_NORMAL", occurredAt: "2026-10-09T03:00:00Z" },
  { id: "4", idempotencyKey: "4", kind: "consumption", quantity: 100, from: "box:2", format: "PHOTO_10X15_NORMAL", eventId: "event1", occurredAt: "2026-10-09T04:00:00Z" },
];

test("report keeps normal and pre-cut inventory separate", () => {
  const report = buildPaperStockReport(movements, { PHOTO_10X15_NORMAL: 1000 });
  assert.equal(report.totalWarehouse, 1600);
  assert.equal(report.totalBoxes, 400);
  assert.equal(report.totalConsumed, 100);
  assert.equal(report.lines.find(x => x.sku === "PHOTO_10X15_NORMAL")?.lowStock, true);
  assert.equal(report.lines.find(x => x.sku === "PHOTO_10X15_PRECUT")?.warehouse, 700);
});

test("unknown SKU is rejected", () => {
  assert.throws(() => buildPaperStockReport([{ ...movements[0], format: "invalid" }]), /Unknown/);
});
