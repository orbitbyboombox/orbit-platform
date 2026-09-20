import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitBiancaContinuation, isNewBiancaCommercialOpportunity, prepareBiancaOpportunityContext, resetBiancaActiveContext } from "../features/connectors/whatsapp-cloud/bianca-opportunity-context.ts";

test("new cotización intent starts a clean opportunity instead of reusing stale service/date", () => {
  const context = {
    customerName: "Mati",
    eventType: "Matrimonio",
    eventDate: "2026-12-12",
    selectedService: "TOTEM",
    confirmedFields: [],
    whatsappAi: { commercialStage: "QUOTING" },
  };
  assert.equal(isNewBiancaCommercialOpportunity("Quiero cotizar para mi matrimonio"), true);
  const prepared = prepareBiancaOpportunityContext(context, "Quiero cotizar para mi matrimonio", "2026-09-19T20:00:00.000Z");
  assert.equal(prepared.reset, true);
  assert.equal(prepared.context.eventDate, undefined);
  assert.equal(prepared.context.selectedService, undefined);
  assert.equal(prepared.context.eventType, undefined);
  assert.equal(prepared.context.customerName, undefined);
  assert.equal(Array.isArray(prepared.context.historicalOpportunities), true);
});

test("explicit continuation can recover the historical opportunity", () => {
  assert.equal(isExplicitBiancaContinuation("Sobre el tótem que vimos"), true);
  assert.equal(isNewBiancaCommercialOpportunity("Sobre el tótem que vimos"), false);
  assert.equal(isExplicitBiancaContinuation("Sigamos con el tótem del 12"), true);
  assert.equal(isNewBiancaCommercialOpportunity("Sigamos con el tótem del 12"), false);
});

test("unconfirmed historical nickname is not retained as active customer name", () => {
  const next = resetBiancaActiveContext({ customerName: "Mati", confirmedFields: [], selectedService: "TOTEM" }, "2026-09-19T20:00:00.000Z");
  assert.equal(next.customerName, undefined);
  assert.equal(next.confirmedFields, undefined);
});

test("explicitly confirmed name survives soft reset without changing its spelling", () => {
  const next = resetBiancaActiveContext({ customerName: "Matías", preferredName: "Matías", preferredNameConfirmed: true, confirmedFields: ["customerName"], selectedService: "TOTEM" }, "2026-09-19T20:00:00.000Z");
  assert.equal(next.customerName, "Matías");
  assert.equal(next.preferredName, "Matías");
  assert.equal(next.preferredNameConfirmed, true);
  assert.deepEqual(next.confirmedFields, ["customerName"]);
});
