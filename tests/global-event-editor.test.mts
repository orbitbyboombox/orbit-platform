import assert from "node:assert/strict";
import test from "node:test";
import { calculateGlobalEventTotals, canApplyNewTotal } from "../features/projects/components/global-event-editor.logic.ts";

test("global editor recalculates totals and preserves historical payments", () => {
  const result = calculateGlobalEventTotals({
    items: [{ quantity: 1, unitPrice: 100_000 }, { quantity: 2, unitPrice: 25_000 }],
    discount: 10_000, transport: 5_000, vatPercent: 19, paid: 50_000,
  });
  assert.equal(result.subtotal, 150_000);
  assert.equal(result.tax, 27_550);
  assert.equal(result.total, 172_550);
  assert.equal(result.paid, 50_000);
  assert.equal(result.balance, 122_550);
});

test("closed or paid invoices cannot be reduced below historical payments", () => {
  assert.equal(canApplyNewTotal(100_000, 50_000, false), true);
  assert.equal(canApplyNewTotal(40_000, 50_000, false), false);
  assert.equal(canApplyNewTotal(60_000, 50_000, true, 100_000), false);
  assert.equal(canApplyNewTotal(100_000, 50_000, true, 100_000), true);
});

test("migration uses an atomic guarded function and no destructive event deletion", async () => {
  const fs = await import("node:fs/promises");
  const sql = await fs.readFile(new URL("../supabase/migrations/20261029170000_global_event_editor.sql", import.meta.url), "utf8");
  assert.match(sql, /update_global_event_editor/);
  assert.match(sql, /for update/);
  assert.match(sql, /paymentsPreserved/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.projects/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.invoice_payments/i);
});
