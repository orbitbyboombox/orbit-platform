import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const founder = readFileSync(new URL("features/founder-workspace/founder-workspace-experience.tsx", root), "utf8");
const model = readFileSync(new URL("features/finance/finance-read-model.ts", root), "utf8");

test("dashboard keeps one receivables card while retaining canonical category data", () => {
  assert.match(founder, /position\("Por cobrar total"\)/);
  assert.match(founder, /\/finance\/receivables/);
  assert.doesNotMatch(founder, /position\("Crédito Empresas"\)/);
  assert.doesNotMatch(founder, /position\("Saldos Clientes \/ Eventos"\)/);
  assert.match(model, /moneyMetric\("Crédito Empresas"/);
  assert.match(model, /moneyMetric\("Saldos Clientes \/ Eventos"/);
});
