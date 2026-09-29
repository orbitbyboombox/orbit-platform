import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eventReceivableTotals } from "../features/projects/event-post-reservation-extras.ts";

const migration = readFileSync("supabase/migrations/20260929030000_imanes_boombox_zero_value_extra.sql", "utf8");
const eventPage = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");
const panel = readFileSync("features/projects/components/event-post-reservation-extras-panel.tsx", "utf8");

test("IMANES BOOMBOX is a defined zero-value catalog extra", () => {
  assert.match(migration, /'IMANES_BOOMBOX'/);
  assert.match(migration, /'IMANES BOOMBOX'/);
  assert.match(migration, /pricing_status, vat_exclusive/);
  assert.match(migration, /\n  0,\n  'CLP'/);
});

test("zero-value catalog extras remain visible in post-reservation selector", () => {
  assert.doesNotMatch(eventPage, /commercial_prices[\s\S]{0,500}unit_price[\s\S]{0,500}gt\("0"\)/);
  assert.match(panel, /catalog\.map\(\(item\) =>/);
  assert.match(panel, /Number\(item\.unit_price \?\? 0\)/);
});

test("zero-value extra does not change total, paid amount, or balance", () => {
  const totals = eventReceivableTotals({ originalTotal: 600_000, paidAmount: 300_000, extras: [{ name: "IMANES BOOMBOX", amount: 0, status: "ACTIVE" }] });
  assert.deepEqual(totals, { originalTotal: 600_000, extrasTotal: 0, total: 600_000, paidAmount: 300_000, balance: 300_000 });
});
