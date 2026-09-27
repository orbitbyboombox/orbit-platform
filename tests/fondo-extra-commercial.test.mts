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

test("reservation Extras uses valid commercial catalog extras even when service metadata lags", () => {
  const drawer = readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");
  assert.match(drawer, /price\.category === "EXTRA"/);
  assert.match(drawer, /price\.pricingStatus === "DEFINED"/);
  assert.match(drawer, /price\.unitPrice != null/);
  assert.match(drawer, /masterExtraToReservation\(price\.code\)/);
  assert.match(drawer, /BACKDROP_230X200_WHITE/);
});

test("real automatic reservation Extras renders and prices the backdrop catalog item", () => {
  const experience = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
  const completion = readFileSync("features/automatic-booking/complete-automatic-booking.service.ts", "utf8");
  assert.match(experience, /price\.category === "EXTRA" && price\.pricing_status === "DEFINED" && price\.unit_price > 0/);
  assert.match(experience, /compatible\.includes\("BACKDROP_230X200_WHITE"\)/);
  assert.match(experience, /label="Fondo 230x200 Blanco"/);
  assert.match(experience, /extraPrice\("BACKDROP_230X200_WHITE"\)/);
  assert.match(experience, /"Fondo 230x200 Blanco":"BACKDROP_230X200_WHITE"/);
  assert.match(completion, /"Fondo 230x200 Blanco": "BACKDROP_230X200_WHITE"/);
});
