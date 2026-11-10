import assert from "node:assert/strict";
import { test } from "node:test";
import { isWeddingCollectionDue } from "../../features/accounts-receivable/wedding-collection-due.ts";

const base = { projectType: "WEDDING", eventDate: "2026-11-20", outstandingBalance: 120000, status: "PENDING" };
test("D-11 is not due; D-10, D-9 and wedding day are due", () => {
  assert.equal(isWeddingCollectionDue(base, "2026-11-09"), false);
  assert.equal(isWeddingCollectionDue(base, "2026-11-10"), true);
  assert.equal(isWeddingCollectionDue(base, "2026-11-11"), true);
  assert.equal(isWeddingCollectionDue(base, "2026-11-20"), true);
  assert.equal(isWeddingCollectionDue(base, "2026-11-21"), false);
});
test("partial payments retain alert; zero balance and settled statuses suppress it", () => {
  assert.equal(isWeddingCollectionDue({...base, outstandingBalance: 500}, "2026-11-10"), true);
  assert.equal(isWeddingCollectionDue({...base, outstandingBalance: 0}, "2026-11-10"), false);
  for (const status of ["PAID", "CANCELLED", "ARCHIVED", "DELETED"]) {
    assert.equal(isWeddingCollectionDue({...base, status}, "2026-11-10"), false);
  }
});
test("other events and invalid dates do not trigger", () => {
  assert.equal(isWeddingCollectionDue({...base, projectType: "CORPORATE"}, "2026-11-10"), false);
  assert.equal(isWeddingCollectionDue({...base, eventDate: "2026-02-30"}, "2026-02-20"), false);
  assert.equal(isWeddingCollectionDue({...base, eventDate: null}, "2026-11-10"), false);
});
test("calendar dates stay stable across Santiago DST boundaries", () => {
  assert.equal(isWeddingCollectionDue({...base, eventDate: "2026-09-16"}, "2026-09-06"), true);
  assert.equal(isWeddingCollectionDue({...base, eventDate: "2026-09-16"}, "2026-09-05"), false);
});

test("D-10 respects all supported wedding type spellings and mixed case", () => {
  for (const projectType of ["WEDDING", "MATRIMONIO", " matrimonio ", "wedding"]) {
    assert.equal(isWeddingCollectionDue({...base, projectType}, "2026-11-10"), true);
  }
});
test("D-10 rejects non-finite or non-positive outstanding balances", () => {
  for (const outstandingBalance of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(isWeddingCollectionDue({...base, outstandingBalance}, "2026-11-10"), false);
  }
});
test("D-10 rejects invalid calendar dates and past events", () => {
  for (const eventDate of ["2026-11-31", "2026-13-01", "not-a-date", "2026-11-09"]) {
    assert.equal(isWeddingCollectionDue({...base, eventDate}, "2026-11-10"), false);
  }
});
