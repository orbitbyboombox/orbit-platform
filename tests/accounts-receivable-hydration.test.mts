import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const center = readFileSync(
  "features/accounts-receivable/accounts-receivable-center.tsx",
  "utf8",
);

test("Accounts Receivable SSR uses deterministic CLP and date text", () => {
  assert.match(center, /String\(Math\.abs\(rounded\)\)\.replace/);
  assert.match(center, /value\.slice\(0,10\)\.split\("-"\)/);
  assert.doesNotMatch(center, /const money=.*Intl\.NumberFormat/);
  assert.doesNotMatch(center, /const date=.*Intl\.DateTimeFormat/);
});

test("Accounts Receivable does not mask hydration mismatches", () => {
  assert.doesNotMatch(center, /suppressHydrationWarning/);
});
