import assert from "node:assert/strict";
import test from "node:test";
import { canSelectScrapbook, isScrapbook, scrapbookPrice, validateScrapbookSelection } from "../features/automatic-booking/scrapbook-policy.ts";

const prices = [{ category: "EXTRA", code: "SCRAPBOOK", unit_price: "50000.00", pricing_status: "DEFINED" }];
for (const category of ["Private", "Birthday"]) {
  test(`${category}: optional SCRAPBOOK adds the official amount exactly once`, () => {
    assert.equal(canSelectScrapbook(category), true);
    validateScrapbookSelection(category, ["Scrapbook"]);
    const base = 330000;
    assert.equal(base + scrapbookPrice(prices), 380000);
    validateScrapbookSelection(category, []);
    assert.equal(base, 330000);
  });
}
for (const category of ["Wedding", "Corporate", "Graduation", "Other", "", "Unknown"]) {
  test(`${category || "empty"}: paid SCRAPBOOK rejected, existing extras unaffected`, () => {
    assert.equal(canSelectScrapbook(category), false);
    for (const label of ["Scrapbook", "SCRAPBOOK", " scrapbook "]) {
      assert.throws(() => validateScrapbookSelection(category, [label]), /solo está disponible/);
    }
    validateScrapbookSelection(category, ["QR", "Branding", "Scrapbook incluido"]);
  });
}
test("duplicate variants cannot double-charge SCRAPBOOK", () => {
  assert.throws(() => validateScrapbookSelection("Birthday", ["Scrapbook", "SCRAPBOOK"]), /más de una/);
});
test("missing, duplicate, undefined or incorrect official prices fail closed", () => {
  for (const catalogue of [[], [...prices, ...prices], [{...prices[0], unit_price:"0"}], [{...prices[0], unit_price:"35000"}], [{...prices[0], pricing_status:"UNDEFINED"}]]) {
    assert.throws(() => scrapbookPrice(catalogue), /precio oficial/);
  }
});
test("category change filters incompatible selection without losing wedding benefits", () => {
  const selected = ["QR", "Scrapbook"];
  assert.deepEqual(selected.filter(extra => !isScrapbook(extra) || canSelectScrapbook("Wedding")), ["QR"]);
  assert.equal(isScrapbook("Scrapbook incluido"), false);
});
