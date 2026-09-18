import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("finance exposes the canonical executive tabs without a parallel write model", () => {
  const tabs = read("features/finance/components/finance-tabs.tsx");
  for (const path of ["/finance", "/finance/incomes", "/finance/expenses", "/finance/receivables", "/finance/payables", "/finance/cash-flow", "/finance/taxes", "/finance/reports"]) assert.match(tabs, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(read("app/(platform)/finance/layout.tsx"), /FinanceTabs/);
  assert.match(read("features/finance/architecture-map.md"), /loadFinanceDashboardReadModel/);
  assert.doesNotMatch(tabs, /supabase|insert|update|delete/i);
});

test("income view reads the existing accounts receivable projection", () => {
  assert.match(read("app/(platform)/finance/incomes/page.tsx"), /loadAccountsReceivable/);
  assert.match(read("features/finance/components/finance-income-center.tsx"), /ReceivableInvoice/);
  assert.match(read("features/finance/architecture-map.md"), /accounts_receivable_projection/);
});

test("tax view does not invent IVA or DTE values", () => {
  const page = read("app/(platform)/finance/taxes/page.tsx");
  assert.match(page, /No se calcula IVA/);
  assert.match(page, /MISSING_TAX_DOCUMENTS/);
});
