import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAdministrativeRole } from "../lib/auth/roles.ts";

const root = new URL("../", import.meta.url);
const founder = readFileSync(new URL("features/founder-workspace/founder-workspace-experience.tsx", root), "utf8");
const expensePage = readFileSync(new URL("app/(platform)/finance/expenses/page.tsx", root), "utf8");

test("Founder Command Center exposes the canonical expense action", () => {
  assert.match(founder, /label: "Ingresar gasto", href: "\/finance\/expenses\?create=1"/);
  assert.match(expensePage, /openCreate=\{\(await searchParams\)\.create==="1"\}/);
});

test("quick action remains touch-friendly on mobile and desktop", () => {
  assert.match(founder, /grid-cols-2 gap-3 md:grid-cols-4/);
  assert.match(founder, /min-h-\[4\.75rem\]/);
});

test("quick action reuses Expense Center without another form or endpoint", () => {
  assert.doesNotMatch(founder, /LiveExpenseCapture|saveExpenseAction|<form/);
  assert.equal((founder.match(/\/finance\/expenses\?create=1/g) ?? []).length, 1);
});

test("action stays inside the administrative Founder workspace", () => {
  assert.match(founder, /FounderWorkspaceExperience/);
  assert.match(founder, /DASHBOARD_QUICK_ACTIONS/);
  assert.equal(isAdministrativeRole("CEO"), true);
  assert.equal(isAdministrativeRole("ADMINISTRATOR"), true);
  assert.equal(isAdministrativeRole("STAFF"), false);
  assert.equal(isAdministrativeRole("CUSTOMER"), false);
});
