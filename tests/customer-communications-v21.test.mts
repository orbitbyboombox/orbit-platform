import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultTaxDocumentDeliverySubject,
  renderTaxDocumentDeliveryHtml,
  type TaxDocumentDeliveryModel,
} from "../features/connectors/google-gmail/application/tax-document-delivery.template.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const service = read("../features/connectors/google-gmail/application/tax-document-delivery.service.ts");
const actions = read("../features/external-tax-documents/delivery.actions.ts");
const control = read("../features/external-tax-documents/tax-document-delivery-control.tsx");
const center = read("../features/external-tax-documents/external-tax-documents-center.tsx");
const cron = read("../app/api/cron/pre-event-reminders/route.ts");
const vercel = read("../vercel.json");
const middleware = read("../middleware.ts");

const model: TaxDocumentDeliveryModel = {
  customerName: "Josefina",
  eventName: "Matrimonio Josefina",
  eventDate: "2026-10-10",
  taxType: "FACTURA",
  folio: "1234",
  issueDate: "2026-09-30",
  total: 476_000,
  website: "https://www.bbox.cl",
};

test("tax document customer delivery is premium and includes the real attachment", () => {
  const html = renderTaxDocumentDeliveryHtml(model);
  assert.equal(defaultTaxDocumentDeliverySubject(model), "Factura N° 1234 · BOOMBOX");
  assert.match(html, /DOCUMENTO TRIBUTARIO/);
  assert.match(html, /Matrimonio Josefina/);
  assert.match(html, /Factura N° 1234/);
  assert.match(html, /\$476\.000/);
  assert.match(service, /driveFileIds/);
  assert.match(service, /attachments/);
  assert.match(service, /storage\.from\(bucket\)\.download/);
});

test("tax document delivery keeps immutable history, resend confirmation and Timeline", () => {
  assert.match(service, /TAX_DOCUMENT_DELIVERY_TYPE/);
  assert.match(service, /original_communication_id/);
  assert.match(service, /TAX_DOCUMENT_SENT/);
  assert.match(service, /idempotencyKey: key/);
  assert.match(control, /Reenviar/);
  assert.match(control, /VISTA PREVIA/);
  assert.match(center, /TaxDocumentDeliveryControl/);
  assert.match(actions, /sendTaxDocumentDelivery/);
});

test("automatic pre-event customer email is scheduled daily and only delivers D-10", () => {
  assert.match(service + read("../features/connectors/google-gmail/application/pre-event-reminder.service.ts"), /sendAutomaticPreEventReminders/);
  assert.match(cron, /sendAutomaticPreEventReminders/);
  assert.match(vercel, /\/api\/cron\/pre-event-reminders/);
  assert.match(vercel, /0 13 \* \* \*/);
  assert.match(middleware, /\/api\/cron\/pre-event-reminders/);
});

test("tax document temporary recipient edits never mutate customer CRM", () => {
  assert.match(actions, /to: String\(formData\.get\("to"\)/);
  assert.doesNotMatch(`${actions}\n${service}`, /from\("customers"\)[\s\S]{0,160}\.update\(/);
});
