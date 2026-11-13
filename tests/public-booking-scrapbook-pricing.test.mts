import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as policy from "../features/automatic-booking/scrapbook-policy.ts";
import * as servicePricing from "../features/automatic-booking/service-pricing.ts";

// Execute the real server pricing function with an in-memory catalogue only.
// Unrelated integrations are inert; no credentials or production writes exist.
const exported: Record<string, unknown> = {};
const source = readFileSync(new URL("../features/automatic-booking/complete-automatic-booking.service.ts", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exported,
  require: (id: string) => {
    if (id === "node:crypto") return require(id);
    if (id === "./scrapbook-policy") return policy;
    if (id === "./service-pricing") return servicePricing;
    if (id.includes("municipality-master-data")) return { loadActiveMunicipalities: async () => [{name:"QA",transport:35000}] };
    if (id.includes("venue-resolution")) return {resolveCanonicalVenue: () => null};
    return {};
  },
});
const pricing = exported.calculateAutomaticBookingPricing as (admin: unknown, input: unknown) => Promise<{extras:number;total:number;reservation:number}>;
function admin(amount = 50000) {
  return {from(table: string) {
    let domain = "";
    const query = {
      select() { return query; },
      eq(key: string, value: string) { if (key === "domain") domain = value; return query; },
      is() { return query; }, in() { return query; }, maybeSingle() { return query; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve({data:table === "commercial_prices" ? [
          {category:"SERVICE",code:"CLASSIC",unit_price:330000,duration_hours:2,rules:{}},
          {category:"EXTRA",code:"SCRAPBOOK",unit_price:amount,pricing_status:"DEFINED"},
          {category:"EXTRA",code:"QR",unit_price:10000},
        ] : domain === "SERVICES" ? [{code:"CLASSIC",configuration:{}}] : null, error:null}));
      },
    }; return query;
  }};
}
function submission(type: string, extras: string[]) {
  return {event:{type,municipality:"QA"},service:{code:"CLASSIC",hours:2,extras,brandingQuantity:2},payment:{method:"TRANSFER"}};
}
for (const type of ["Private", "Birthday"]) test(`${type}: real server calculator adds/removes catalogue price and recalculates deposit`, async () => {
  const without = await pricing(admin(),submission(type,["QR"]));
  const withExtra = await pricing(admin(),submission(type,["QR","SCRAPBOOK"]));
  assert.equal(without.total,375000);
  assert.equal(withExtra.total,425000);
  assert.equal(withExtra.extras,60000);
  assert.equal(withExtra.reservation,212500);
  assert.deepEqual(await pricing(admin(),submission(type,["QR"])),without);
});
test("server rejects forbidden category before querying any database", async () => {
  await assert.rejects(pricing({from(){throw new Error("Database must not be touched");}},submission("Wedding",["SCRAPBOOK"])), /solo está disponible/);
});
test("server rejects a changed official price instead of charging zero or a client amount", async () => {
  await assert.rejects(pricing(admin(35000),submission("Birthday",["Scrapbook"])), /precio oficial/);
});
test("wedding included benefit retains its existing zero-cost calculation", async () => {
  const quote = await pricing(admin(),submission("Wedding",["QR incluido","Scrapbook incluido"]));
  assert.equal(quote.extras,0);
  assert.equal(quote.total,365000);
});
