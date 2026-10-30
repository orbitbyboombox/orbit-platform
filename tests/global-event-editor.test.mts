import assert from "node:assert/strict";
import test from "node:test";
import { buildGlobalEventEditorChanges, calculateGlobalEventTotals, canApplyNewTotal } from "../features/projects/components/global-event-editor.logic.ts";

const editorInput = {
  project: { name: "Evento", eventDate: "2026-11-08", eventTime: "20:00", location: "Recinto", city: "Santiago", eventAddress: "Dirección", notes: "Notas" },
  services: [{ id: "service-1", code: "BBOX360", duration: 4, extras: ["QR"] }],
  schedule: { serviceStartLocal: "2026-11-08T20:00", serviceEndLocal: "2026-11-09T00:00", staffCallLocal: "2026-11-08T19:00" },
  quotation: { items: [{ itemType: "SERVICE" as const, code: "BBOX360", label: "BBOX360", quantity: 1, unitPrice: 100_000 }], discount: 0, transport: 0, vatPercent: 19 },
};

test("operational save excludes commercial values", () => {
  const changes = buildGlobalEventEditorChanges(editorInput, "operational");
  assert.equal("items" in changes, false);
  assert.equal("discount" in changes, false);
  assert.ok("eventDate" in changes);
  assert.ok("services" in changes);
  assert.equal(changes.eventDate, "2026-11-08");
  assert.deepEqual(changes.services, [{ id: "service-1", code: "BBOX360", duration: 4, extras: ["QR"], removed: false }]);
});

test("commercial save excludes operational values", () => {
  const changes = buildGlobalEventEditorChanges(editorInput, "commercial");
  assert.equal("eventDate" in changes, false);
  assert.equal("services" in changes, false);
  assert.ok("items" in changes);
  assert.deepEqual(changes.items, editorInput.quotation.items);
  assert.equal(changes.vatPercent, 19);
});

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


test("operational-only SQL save returns persisted financial amounts without synchronizing them", async () => {
  const fs = await import("node:fs/promises");
  const sql = await fs.readFile(new URL("../supabase/migrations/20261029170000_global_event_editor.sql", import.meta.url), "utf8");
  assert.match(sql, /if not changed_commercial then\s+total_value := coalesce\(quotation_row\.grand_total, 0\\)/);
  assert.match(sql, /select coalesce\(i\.paid_amount, 0\\) into paid_value/);
  assert.match(sql, /if changed_commercial then\s+perform public\.sync_estimated_cost_sheet\(p_project_id\\)/);
});
