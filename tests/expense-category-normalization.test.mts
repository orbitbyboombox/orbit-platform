import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExpenseCategory } from "../features/finance/expense-source-read-model.ts";

test("maps verified legacy transport and administration categories", () => {
  assert.equal(normalizeExpenseCategory("TRANSPORT"), "TRANSPORT_VEHICLES");
  assert.equal(normalizeExpenseCategory("FUEL"), "TRANSPORT_VEHICLES");
  assert.equal(normalizeExpenseCategory("ADMINISTRATION"), "OFFICE_ADMIN");
  assert.equal(normalizeExpenseCategory("TRANSPORTE"), "TRANSPORT_VEHICLES");
});

test("does not invent a category for ambiguous legacy expense concepts", () => {
  assert.equal(normalizeExpenseCategory("OTHER_OPERATIONAL"), null);
  assert.equal(normalizeExpenseCategory("OTHER"), null);
  assert.equal(normalizeExpenseCategory("SERVICES"), null);
  assert.equal(normalizeExpenseCategory(null), null);
});
