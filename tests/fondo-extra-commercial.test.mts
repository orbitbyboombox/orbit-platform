import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getQuotationExtras, QUOTATION_EXTRA_RULES } from "../features/business-core/rules/quotation-extra.rules.ts";
import { calculateCommercialTax } from "../features/commercial-flow/commercial-policy.ts";

const extraId = "BACKDROP_230X200_WHITE" as const;

test("FONDO 230X200 BLANCO is a canonical selectable extra for every event type", () => {
  assert.equal(QUOTATION_EXTRA_RULES[extraId].label, "FONDO 230X200 BLANCO");
  assert.equal(QUOTATION_EXTRA_RULES[extraId].price.value?.amount, 65_000);
  for (const eventType of ["WEDDING", "BIRTHDAY", "GRADUATION", "COMPANY", "PUBLIC_EVENT", "PARTY", "OTHER"] as const) {
    assert.ok(getQuotationExtras(eventType).some((extra) => extra.id === extraId));
  }
});

test("FONDO 230X200 BLANCO uses the configured catalog price in quotation totals", () => {
  const engine = readFileSync("features/quotation-engine/quotation-engine.ts", "utf8");
  assert.match(engine, /configuredPrice\(catalog, "EXTRA", selected\.extraId\)/);
  assert.match(engine, /lines\.push\(\{ code: selected\.extraId/);
  const subtotal = 200_000 + QUOTATION_EXTRA_RULES[extraId].price.value!.amount;
  assert.equal(subtotal, 265_000);
  assert.deepEqual(calculateCommercialTax({ taxableAmount: subtotal, customerType: "PRIVATE", vatPercentage: 19 }), { net: 265_000, vat: 0, total: 265_000 });
  assert.deepEqual(calculateCommercialTax({ taxableAmount: subtotal, customerType: "COMPANY", vatPercentage: 19 }), { net: 265_000, vat: 50_350, total: 315_350 });
});
