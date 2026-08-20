import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { suggestBusinessExpenseCategory } from "../features/expense-center/business-expense-classification.ts";

const migration = readFileSync("supabase/migrations/0154_business_expense_capture.sql", "utf8");
const action = readFileSync("features/expense-center/actions.ts", "utf8");
const ui = readFileSync("features/expense-center/expense-center.tsx", "utf8");
const finance = readFileSync("features/finance/finance-read-model.ts", "utf8");

test("equipment purchase is classified as an asset without event allocation", () => {
  const result = suggestBusinessExpenseCategory({ association: "EQUIPMENT", supplier: "Samsung", description: "Pantalla nueva", category: "OTHER" });
  assert.equal(result.scope, "ASSET_EQUIPMENT");
  assert.equal(result.category, "EQUIPMENT");
});

test("vehicle battery is a vehicle maintenance suggestion", () => {
  const result = suggestBusinessExpenseCategory({ association: "VEHICLE", supplier: "Taller", description: "Cambio batería vehículo", category: "OTHER" });
  assert.equal(result.scope, "VEHICLE");
  assert.equal(result.category, "MAINTENANCE");
});

test("Founder confirmation remains canonical over extraction suggestions", () => {
  assert.match(migration, /suggested_category[\s\S]*confirmed_category/);
  assert.match(migration, /new\.suggested_category is not null and new\.confirmed_category is null/);
  assert.match(action, /extraction_status:"CONFIRMED"[\s\S]*suggested_category:suggestion\.category[\s\S]*confirmed_category:category/);
});

test("business expense scopes cannot contaminate an event", () => {
  assert.match(migration, /new\.expense_scope='EVENT_DIRECT' and new\.project_id is null/);
  assert.match(migration, /new\.expense_scope in\('BUSINESS_OVERHEAD','ASSET_EQUIPMENT','VEHICLE','RECURRING_FIXED'\) and new\.project_id is not null/);
  assert.match(action, /association==="EVENT"\?associationId:null/);
  assert.match(action, /if\(!id&&association==="EVENT"/);
});

test("receipt is stored once and linked to the central documents model", () => {
  assert.match(action, /SHA-256/);
  assert.match(action, /expense-document:\$\{receiptChecksum\}/);
  assert.match(action, /document_type:"EXPENSE_DOCUMENT"/);
  assert.match(action, /onConflict:"storage_path"/);
  assert.match(migration, /add column if not exists expense_id uuid references public\.expenses/);
});

test("VAT and exempt values reconcile into the submitted total", () => {
  assert.match(action, /const total=subtotal\+vat\+exempt/);
});

test("cash read model includes paid expenses and excludes pending expenses", () => {
  assert.match(finance, /expenses[\s\S]*status[\s\S]*PAID/);
  assert.doesNotMatch(finance, /status[^\n]{0,30}PENDING[^\n]{0,80}cash/i);
});

test("migration is forward-only DDL and never captures expenses automatically", () => {
  assert.doesNotMatch(migration, /^\s*(insert|update|delete)\s+/gim);
  assert.doesNotMatch(migration, /invoice_payments|receivable_movements|drive_file_id/);
});

test("Expense Center exposes scope, status and category filters from the read model", () => {
  assert.match(ui, /label="Alcance"/);
  assert.match(ui, /expense\.scope/);
  assert.match(ui, /expense\.subcategory/);
  assert.doesNotMatch(ui, /650000|505000|124000/);
});

test("staff reimbursements and recurring fixed expenses remain explicit scopes", () => {
  assert.match(migration, /STAFF_REIMBURSEMENT/);
  assert.match(migration, /RECURRING_FIXED/);
  assert.match(ui, /Reembolso Staff/);
  assert.match(ui, /Fijo recurrente/);
});
