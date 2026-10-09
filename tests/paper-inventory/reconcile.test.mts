import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePaperLedger } from "../../src/lib/paper-inventory/reconcile.ts";
import type { PaperMovement } from "../../src/lib/paper-inventory/domain.ts";

const mk = (id: string, kind: PaperMovement["kind"], quantity: number, from?: PaperMovement["from"], to?: PaperMovement["to"], eventId?: string): PaperMovement => ({
  id, idempotencyKey: id, kind, quantity, from, to, eventId, format: "4x6_normal", occurredAt: `2026-10-09T12:00:0${id.length}Z`,
});

test("opening, transfer, event close and next event reconcile without double count", () => {
  const entries = [
    mk("a", "opening", 1400, undefined, "warehouse"),
    mk("bb", "transfer", 700, "warehouse", "box:2"),
    mk("ccc", "consumption", 300, "box:2", undefined, "event-friday"),
    mk("dddd", "consumption", 100, "box:2", undefined, "event-saturday"),
  ];
  const result = reconcilePaperLedger([...entries, entries[2]]);
  assert.equal(result.warehouseTotal, 700);
  assert.equal(result.boxesTotal, 300);
  assert.equal(result.consumedTotal, 400);
  assert.equal(result.accountedTotal, 1400);
  assert.equal(result.movementsProcessed, 4);
});

test("rejects overconsumption across consecutive events", () => {
  assert.throws(() => reconcilePaperLedger([
    mk("a", "opening", 700, undefined, "warehouse"),
    mk("bb", "transfer", 700, "warehouse", "box:2"),
    mk("ccc", "consumption", 600, "box:2", undefined, "friday"),
    mk("dddd", "consumption", 200, "box:2", undefined, "saturday"),
  ]), /Insufficient/);
});
