import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("customer profile exposes canonical quotation history in newest-first order", () => {
  const repository = source("features/crm/repository.ts");
  const profile = source("features/crm/customer-profile.tsx");
  assert.match(repository, /from\("quotations"\)/);
  assert.match(repository, /order\("created_at", \{ ascending: false \}\)/);
  assert.match(repository, /commercial_sends/);
  for (const field of ["quotation_number", "status", "expiration_date", "final_customer_price", "converted_at"]) {
    assert.match(repository, new RegExp(field));
  }
  assert.match(profile, /Cotizaciones del Cliente/);
  assert.match(profile, /ABRIR DETALLE/);
  assert.match(profile, /USAR ESTA COTIZACIÓN/);
});

test("quotation reuse goes through the existing canonical quote action surface", () => {
  const profile = source("features/crm/customer-profile.tsx");
  const detail = source("features/commercial-hub/quote-detail-experience.tsx");
  assert.match(profile, /#accion-comercial/);
  assert.match(detail, /acceptCommercialQuoteAction/);
  assert.match(detail, /loadCommercialQuoteConversionReviewAction/);
});

test("customers default to server-side alphabetical ordering", () => {
  const repository = source("features/crm/repository.ts");
  const page = source("app/(platform)/customers/page.tsx");
  assert.match(repository, /order\("full_name", \{ ascending: options\.sort !== "name_desc" \}\)/);
  assert.match(page, /sort=params\.sort==="name_desc"\?"name_desc":"name_asc"/);
});
