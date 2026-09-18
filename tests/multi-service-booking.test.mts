import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveServicePrice, ServicePriceUnavailableError } from "../features/automatic-booking/service-pricing.ts";

const automatic = readFileSync("features/automatic-booking/automatic-booking-experience.tsx", "utf8");
const completion = readFileSync("features/automatic-booking/complete-automatic-booking.service.ts", "utf8");
const capacity = readFileSync("app/api/booking/[token]/capacity/route.ts", "utf8");
const commercial = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");
const whatsapp = readFileSync("features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", "utf8");

test("automatic booking presents additional operational services and a line-item summary", () => {
  assert.match(automatic, /¿Quieres agregar otro servicio BOOMBOX\?/);
  assert.match(automatic, /✓ Agregado/);
  assert.match(automatic, /additionalCodes/);
  assert.match(automatic, /serviceLines/);
  assert.match(automatic, /Resumen Comercial/);
  assert.match(automatic, /setPending\(true\);setProgressState\("VALIDATING"\)/);
  assert.match(automatic, /aria-busy=\{state!=="FAILED"\}/);
});

test("multi-service booking persists canonical project_services and prices each service", () => {
  assert.match(completion, /requestedServiceCodes/);
  assert.match(completion, /upsert\(\{ project_id: projectId, service_code: serviceCode/);
  assert.match(completion, /serviceLines = serviceCodes\.map/);
  assert.match(completion, /serviceTotal = serviceLines\.reduce/);
});

test("capacity preflight receives every selected service without collapsing them", () => {
  assert.match(capacity, /new Set\(input\.serviceCodes/);
  assert.doesNotMatch(capacity, /slice\(0, 3\)/);
});

test("manual commercial quote prevents accidentally adding the same catalog service twice", () => {
  assert.match(commercial, /Ese servicio ya está agregado a la cotización/);
});

test("BIANCA preserves a primary service plus secondary services in customer memory", () => {
  assert.match(whatsapp, /secondaryServices/);
  assert.match(whatsapp, /selectedServices/);
});

test("fixed services resolve without inventing a duration", () => {
  const resolved = resolveServicePrice({ serviceCode: "BOOMBALL", requestedDuration: 3, rows: [{ duration_hours: null, unit_price: 280000, rules: { fixed: true } }] });
  assert.equal(resolved.amount, 280000);
  assert.equal(resolved.hours, null);
  assert.equal(resolved.pricingMode, "FIXED");
});

test("duration services still require a matching approved duration price", () => {
  const resolved = resolveServicePrice({ serviceCode: "CLASSIC", requestedDuration: 3, rows: [{ duration_hours: 3, unit_price: 120000, rules: {} }] });
  assert.equal(resolved.amount, 120000);
  assert.equal(resolved.hours, 3);
  assert.throws(() => resolveServicePrice({ serviceCode: "CLASSIC", requestedDuration: 4, rows: [{ duration_hours: 3, unit_price: 120000, rules: {} }] }), (error) => error instanceof ServicePriceUnavailableError && error.code === "SERVICE_PRICE_UNAVAILABLE");
});

test("pricing failures stay structured and retain service diagnostics", () => {
  assert.match(completion, /SERVICE_PRICE_UNAVAILABLE/);
  assert.match(completion, /pricingMode/);
  assert.match(completion, /requestedDuration/);
});
