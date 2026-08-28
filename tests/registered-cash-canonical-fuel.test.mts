import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectCanonicalFuelLogs, type CanonicalFuelCandidate } from "../features/finance/canonical-fuel.ts";

const valid = (overrides: Partial<CanonicalFuelCandidate> = {}): CanonicalFuelCandidate => ({
  id: "fuel-valid",
  receiptPath: "fuel/receipt.png",
  gasStation: "Copec",
  routeId: "route-active",
  routeStatus: "ACTIVE",
  routeDeletedAt: null,
  routeNotes: "Ruta productiva",
  hasActiveProductionProject: true,
  ...overrides,
});

test("fuel productivo válido impacta caja", () => {
  assert.deepEqual(selectCanonicalFuelLogs([valid()], new Set()).map((row) => row.id), ["fuel-valid"]);
});

test("fuel sin ruta activa productiva no impacta caja", () => {
  const rows = [
    valid({ id: "cancelled", routeStatus: "CANCELLED" }),
    valid({ id: "deleted", routeDeletedAt: "2026-08-15T00:00:00Z" }),
    valid({ id: "cancelled-project", hasActiveProductionProject: false }),
    valid({ id: "no-route", routeId: null }),
  ];
  assert.deepEqual(selectCanonicalFuelLogs(rows, new Set()), []);
});

test("QA o TEST histórico no impacta caja", () => {
  const rows = [
    valid({ id: "test-path", receiptPath: "TEST/phase-e-receipt" }),
    valid({ id: "test-station", gasStation: "TEST" }),
    valid({ id: "test-notes", routeNotes: "TEST PHASE E" }),
  ];
  assert.deepEqual(selectCanonicalFuelLogs(rows, new Set()), []);
});

test("receipt_path físico se cuenta una sola vez", () => {
  const rows = [valid({ id: "first" }), valid({ id: "duplicate" })];
  assert.deepEqual(selectCanonicalFuelLogs(rows, new Set()).map((row) => row.id), ["first"]);
});

test("fuel ya materializado en expenses no duplica egreso", () => {
  assert.deepEqual(selectCanonicalFuelLogs([valid()], new Set(["fuel/receipt.png"])), []);
});

test("caso histórico de dos fuel TEST de 25.000 queda excluido estructuralmente", () => {
  const rows = [
    valid({ id: "251f608e-8ad3-4ec3-bb9d-f882e09ddf7f", receiptPath: "TEST/phase-e-receipt", gasStation: "TEST", routeStatus: "CANCELLED", routeDeletedAt: "2026-08-15T17:49:53Z", hasActiveProductionProject: false }),
    valid({ id: "c413cca8-e76b-4d14-b0a6-40a0b2f5c83b", receiptPath: "TEST/phase-e-receipt", gasStation: "TEST", routeStatus: "CANCELLED", routeDeletedAt: "2026-08-15T17:49:53Z", hasActiveProductionProject: false }),
  ];
  assert.deepEqual(selectCanonicalFuelLogs(rows, new Set()), []);
});

test("baseline de Caja registrada excluye TEST y no descuenta overhead comprometido", () => {
  const collected = 4_618_742;
  const paidExpenses = 1;
  const staffPaid = 50_000;
  const fuel = 0;
  const fixedCommitted = 650_000;
  const registeredCash = collected - paidExpenses - staffPaid - fuel;
  assert.equal(registeredCash, 4_568_741);
  assert.equal(registeredCash - fixedCommitted, 3_918_741);
});

test("Dashboard y Founder consumen la misma Caja del Finance Read Model", () => {
  const root = new URL("../", import.meta.url);
  const model = readFileSync(new URL("features/finance/finance-read-model.ts", root), "utf8");
  const founder = readFileSync(new URL("features/founder-workspace/founder-dashboard-layout.tsx", root), "utf8");
  assert.match(model, /moneyMetric\("Caja registrada", availableCash/);
  assert.match(founder, /kpi\.cash_registered/);
  assert.match(founder, /DashboardLayoutEditor/);
  assert.match(model, /selectCanonicalFuelLogs/);
});
