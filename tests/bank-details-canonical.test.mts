import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OFFICIAL_BOOMBOX_BANK_DETAILS } from "../features/company-settings/bank-details.ts";

test("official BOOMBOX bank details are canonical and include the legal holder", () => {
  assert.deepEqual(OFFICIAL_BOOMBOX_BANK_DETAILS, {
    companyLabel: "PRODUCCIONES BOOMBOX COMPANY SPA",
    bankName: "BCI",
    accountType: "Cuenta Corriente",
    accountNumber: "52093409",
    rut: "76.565.272-3",
    email: "contabilidad@bbox.cl",
  });
});

test("collection instructions use the official constant instead of stale settings", () => {
  const source = readFileSync(new URL("../features/accounts-receivable/collection-bank-details.ts", import.meta.url), "utf8");
  assert.match(source, /return \{ \.\.\.OFFICIAL_BOOMBOX_BANK_DETAILS \}/);
  assert.doesNotMatch(source, /settings\.legalName|bank\.bankName|bank\.accountNumber/);
});
