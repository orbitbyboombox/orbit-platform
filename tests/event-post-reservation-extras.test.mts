import assert from "node:assert/strict";
import test from "node:test";
import { calendarExtraNames, eventReceivableTotals } from "../features/projects/event-post-reservation-extras.ts";

test("post-reservation extras update total and balance without changing paid amount", () => {
  assert.deepEqual(eventReceivableTotals({ originalTotal: 600_000, paidAmount: 300_000, extras: [{ name: "Imanes", amount: 70_000, status: "ACTIVE" }] }), { originalTotal: 600_000, extrasTotal: 70_000, total: 670_000, paidAmount: 300_000, balance: 370_000 });
});

test("calendar names exclude prices and cancelled extras", () => {
  assert.deepEqual(calendarExtraNames([{ name: "Imanes", amount: 70_000, status: "ACTIVE" }, { name: "Fondo blanco", amount: 65_000, status: "CANCELLED" }]), ["Imanes"]);
});

test("two active extras aggregate once", () => {
  assert.equal(eventReceivableTotals({ originalTotal: 600_000, paidAmount: 0, extras: [{ name: "Imanes", amount: 70_000, status: "ACTIVE" }, { name: "Scrapbook", amount: 75_000, status: "ACTIVE" }] }).extrasTotal, 145_000);
});
