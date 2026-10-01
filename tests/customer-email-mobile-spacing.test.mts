import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all customer email families have explicit mobile spacing guards", () => {
  const shared = source("features/connectors/google-gmail/application/boombox-commercial-email.html.ts");
  const d10 = source("features/connectors/google-gmail/application/pre-event-reminder.template.ts");
  const collection = source("features/accounts-receivable/collection-email.template.ts");

  assert.match(shared, /max-width:520px/);
  assert.match(shared, /orbit-body p\{margin-bottom:14px!important\}/);\n  assert.match(shared, /orbit-body \.orbit-signature p\{margin:0!important\}/);
  assert.match(shared, /orbit-action-link/);
  assert.match(d10, /max-width:520px/);
  assert.match(d10, /orbit-pad p\{line-height:1\.72!important\}/);
  assert.match(collection, /max-width:520px/);
  assert.match(collection, /orbit-detail-cell\{display:block!important;width:100%!important/);
});

test("reservation and tax emails inherit the shared premium responsive shell", () => {
  const reservation = source("features/connectors/google-gmail/application/reservation-confirmation.html.ts");
  const tax = source("features/connectors/google-gmail/application/tax-document-delivery.template.ts");
  assert.match(reservation, /renderBoomboxCommercialEmail/);
  assert.match(tax, /renderBoomboxCommercialEmail/);
});
