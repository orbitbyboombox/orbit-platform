import test from "node:test";
import assert from "node:assert/strict";
import { defaultD10Date, isD10ManualCollectionDue } from "../../features/accounts-receivable/d10-manual-collection.ts";

test("manual D-10 uses the exact tenth day for any project type with a balance", () => {
    assert.equal(defaultD10Date("2026-11-19"), "2026-11-09");
    assert.equal(isD10ManualCollectionDue({ eventDate: "2026-11-19", outstandingBalance: 1000, status: "CONFIRMED" }, "2026-11-09"), true);
    assert.equal(isD10ManualCollectionDue({ eventDate: "2026-11-19", outstandingBalance: 1000, status: "CONFIRMED" }, "2026-11-08"), false);
    assert.equal(isD10ManualCollectionDue({ eventDate: "2026-11-19", outstandingBalance: 1000, status: "CONFIRMED" }, "2026-11-10"), false);
  });

test("manual D-10 excludes zero balances and cancelled events", () => {
    const base = { eventDate: "2026-11-19", status: "CONFIRMED" };
    assert.equal(isD10ManualCollectionDue({ ...base, outstandingBalance: 0 }, "2026-11-09"), false);
    assert.equal(isD10ManualCollectionDue({ ...base, outstandingBalance: 1000, status: "CANCELLED" }, "2026-11-09"), false);
  });

test("manual D-10 honours an administrative reprogramming", () => {
    assert.equal(isD10ManualCollectionDue({ eventDate: "2026-11-19", scheduledFor: "2026-11-12", outstandingBalance: 1000, status: "CONFIRMED" }, "2026-11-12"), true);
    assert.equal(isD10ManualCollectionDue({ eventDate: "2026-11-19", scheduledFor: "2026-11-12", outstandingBalance: 1000, status: "CONFIRMED" }, "2026-11-09"), false);
  });
