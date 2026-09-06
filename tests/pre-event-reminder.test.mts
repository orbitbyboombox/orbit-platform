import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPreEventReminderText,
  daysUntilPreEvent,
  defaultPreEventReminderSubject,
  formatPreEventDate,
  preEventReminderFingerprint,
  renderPreEventReminderHtml,
  type PreEventReminderModel,
} from "../features/connectors/google-gmail/application/pre-event-reminder.template.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const service = read("../features/connectors/google-gmail/application/pre-event-reminder.service.ts");
const actions = read("../features/projects/communications/pre-event-reminder.actions.ts");
const control = read("../features/projects/communications/pre-event-reminder-control.tsx");
const workspace = read("../features/projects/components/project-workspace-experience.tsx");
const migration = read("../supabase/migrations/0215_pre_event_reminder_communication.sql");

const bankDetails = {
  companyLabel: "PRODUCCIONES BOOMBOX COMPANY SPA",
  bankName: "Banco BCI",
  accountType: "Cuenta Corriente",
  accountNumber: "52093409",
  rut: "76.565.272-3",
  email: "contabilidad@bbox.cl",
};

const base: PreEventReminderModel = {
  customerName: "Josefina",
  eventDate: "2026-05-15",
  operatorArrivalAt: null,
  assemblyStartAt: null,
  scrapbookIncluded: false,
  photoDesignPending: false,
  payment: null,
  website: "https://www.bbox.cl",
};

test("global Event action opens the canonical MobileDialog composer", () => {
  assert.match(workspace, /label="Recordatorio pre-evento"/);
  assert.match(workspace, /scroll\("pre-event-reminder"\)/);
  assert.match(workspace, /<PreEventReminderControl/);
  assert.match(control, /<MobileDialog/);
  for (const field of ["PARA", "CC", "ASUNTO", "VISTA PREVIA"]) {
    assert.match(control, new RegExp(field));
  }
});

test("one renderer is global for Matrimonio, Social, Empresa and future Event types", () => {
  for (const eventType of ["Matrimonio", "Social", "Empresa", "Festival futuro"]) {
    const html = renderPreEventReminderHtml({ ...base, customerName: eventType });
    assert.match(html, /Todo listo para tu evento/);
    assert.match(html, new RegExp(eventType));
  }
  assert.doesNotMatch(service, /switch\s*\(.*project_type/);
  assert.doesNotMatch(service, /project_type\s*===\s*["'](?:Wedding|Corporate|Birthday)/);
});

test("canonical Event date is validated and formatted in Spanish", () => {
  assert.equal(formatPreEventDate("2026-05-15"), "15 de mayo de 2026");
  assert.equal(
    defaultPreEventReminderSubject("2026-05-15"),
    "Todo listo para tu evento BOOMBOX · 15 de mayo de 2026",
  );
  assert.throws(() => formatPreEventDate("2026-02-30"), /fecha canónica válida/);
  assert.match(service, /event_date/);
});

test("manual timing is contextual and never gates sending at seven days", () => {
  assert.equal(daysUntilPreEvent("2026-05-15", new Date("2026-05-08T16:00:00Z")), 7);
  assert.doesNotMatch(actions, /daysUntilEvent\s*[!=<>]=?\s*7/);
  assert.doesNotMatch(service, /daysUntilEvent\s*[!=<>]=?\s*7/);
  assert.doesNotMatch(`${actions}\n${service}`, /\bcron\b|scheduler|scheduleJob/i);
});

test("fully paid renderer contains zero payment, due-date or bank content", () => {
  const html = renderPreEventReminderHtml(base);
  const text = buildPreEventReminderText(base);
  for (const output of [html, text]) {
    assert.doesNotMatch(output, /Saldo pendiente/i);
    assert.doesNotMatch(output, /Fecha de vencimiento/i);
    assert.doesNotMatch(output, /Datos para transferencia/i);
    assert.doesNotMatch(output, /52093409/);
    assert.doesNotMatch(output, /contabilidad@bbox\.cl/);
  }
});

test("canonical positive balance renders the compact payment block near the end", () => {
  const model: PreEventReminderModel = {
    ...base,
    payment: {
      projectionId: "projection-1",
      outstandingBalance: 750_000,
      dueDate: "2026-05-12",
      bankDetails,
    },
  };
  const html = renderPreEventReminderHtml(model);
  assert.match(html, /Saldo pendiente/);
  assert.match(html, /\$750\.000/);
  assert.match(html, /12 de mayo de 2026/);
  assert.match(html, /Banco BCI/);
  assert.match(html, /contabilidad@bbox\.cl/);
  assert.ok(html.indexOf("Todo coordinado") < html.indexOf("Saldo pendiente"));
  assert.doesNotMatch(html, /50\s*%|0\.5\s*\*/);
});

test("Scrapbook and photo design blocks obey actual conditions", () => {
  const empty = renderPreEventReminderHtml(base);
  assert.doesNotMatch(empty, /Tu Scrapbook/);
  assert.doesNotMatch(empty, /Diseño de tus fotos/);
  const included = renderPreEventReminderHtml({
    ...base,
    scrapbookIncluded: true,
    photoDesignPending: true,
  });
  assert.match(included, /Tu Scrapbook/);
  assert.match(included, /mesa junto al tótem/);
  assert.match(included, /Diseño de tus fotos/);
  assert.match(service, /event_operational_requirements/);
  assert.match(service, /project_services/);
  assert.match(service, /requiresPhotoStripDesign/);
  assert.match(service, /PHOTO_STRIP_DESIGN/);
  assert.match(service, /workflow_status === "APPROVED"/);
});

test("canonical actual logistics override approximate arrival copy", () => {
  const html = renderPreEventReminderHtml({
    ...base,
    operatorArrivalAt: "2026-05-15T20:00:00Z",
    assemblyStartAt: "2026-05-15T19:00:00Z",
  });
  assert.match(html, /llegará a las 16:00/);
  assert.match(html, /comenzará la instalación a las 15:00/);
  assert.doesNotMatch(html, /aproximadamente 1 hora/);
  assert.doesNotMatch(html, /aproximadamente 2 horas/);
});

test("premium renderer carries required operational and electrical copy", () => {
  const html = renderPreEventReminderHtml(base);
  for (const copy of [
    "BOOMBOX",
    "Todo listo para tu evento",
    "Todo coordinado",
    "Operador BOOMBOX",
    "Montaje",
    "enchufe 220V independiente",
    "1,5 m del tótem",
    "Nos vemos muy pronto",
  ]) {
    assert.match(html, new RegExp(copy));
  }
  assert.doesNotMatch(html, /Junto con saludarlos/);
});

test("preview and provider send call the same real renderer", () => {
  assert.match(control, /renderPreEventReminderHtml\(composer\.model, subject\)/);
  assert.match(control, /srcDoc=\{previewHtml\}/);
  assert.match(service, /const htmlBody = renderPreEventReminderHtml\(composer\.model, subject\)/);
  assert.match(service, /htmlBody,/);
});

test("temporary TO and CC edits are sent without mutating CRM", () => {
  assert.match(control, /formData\.set\("to", to\)/);
  assert.match(control, /formData\.set\("cc", cc\)/);
  assert.match(actions, /to: String\(formData\.get\("to"\)/);
  assert.match(service, /normalizeEmailRecipients\(\{ to: input\.to, cc: input\.cc \}\)/);
  assert.doesNotMatch(`${actions}\n${service}`, /from\("customers"\)[\s\S]{0,120}\.update\(/);
});

test("financial, bank and receipt sources are canonical and read-only", () => {
  assert.match(service, /from\("accounts_receivable_projection"\)/);
  assert.match(service, /outstanding_balance/);
  assert.match(service, /due_date/);
  assert.match(service, /resolveCollectionBankDetails\(company\)/);
  assert.match(service, /company_settings\.pdf_configuration\.commercialBank\.email/);
  assert.doesNotMatch(service, /reservationAmount|depositPercent|quote.*balance|0\.5/);
  assert.doesNotMatch(service, /from\("(?:invoices|invoice_payments|financial_event_records)"\)[\s\S]{0,160}\.update\(/);
});

test("communication history, timeline, resend confirmation and idempotency are explicit", () => {
  assert.match(service, /communication_type: PRE_EVENT_REMINDER_TYPE/);
  assert.match(service, /context_snapshot: contextSnapshot/);
  assert.match(service, /RECORDATORIO PRE-EVENTO ENVIADO/);
  assert.match(service, /original_communication_id/);
  assert.match(service, /idempotencyKey: key/);
  assert.match(control, /¿Enviar nuevamente el recordatorio pre-evento/);
  assert.match(control, /submissionGate/);
  assert.match(migration, /unique index[\s\S]*PRE_EVENT_REMINDER/);
  assert.match(migration, /context_snapshot jsonb/);
});

test("send path does not mutate Finance, Drive, Calendar or WhatsApp", () => {
  assert.doesNotMatch(service, /invoice_payments|payment_ledger|calendar_sync|drive_sync|whatsapp/i);
  assert.match(service, /driveFileIds: \[\]/);
  assert.doesNotMatch(actions, /calendar|drive|whatsapp/i);
});

test("HTML is Gmail-safe, centered, and constrained for 390px mobile", () => {
  const html = renderPreEventReminderHtml({ ...base, payment: {
    projectionId: "projection-1",
    outstandingBalance: 123_456,
    dueDate: "2026-05-12",
    bankDetails,
  } });
  assert.match(html, /name="viewport"/);
  assert.match(html, /max-width:620px/);
  assert.match(html, /width:100%/);
  assert.match(html, /box-sizing:border-box/);
  assert.match(html, /max-width:480px/);
  assert.doesNotMatch(html, /<script|position:fixed|width:\s*[7-9]\d\dpx/i);
});

test("fingerprint changes for every canonical conditional or financial input", () => {
  const original = preEventReminderFingerprint(base);
  assert.notEqual(original, preEventReminderFingerprint({ ...base, scrapbookIncluded: true }));
  assert.notEqual(original, preEventReminderFingerprint({ ...base, photoDesignPending: true }));
  assert.notEqual(original, preEventReminderFingerprint({
    ...base,
    payment: { projectionId: "p", outstandingBalance: 1, dueDate: null, bankDetails },
  }));
});
