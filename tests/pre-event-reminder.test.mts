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
const middleware = read("../middleware.ts");
const workspace = read("../features/projects/components/project-workspace-experience.tsx");
const migration = read("../supabase/migrations/0215_pre_event_reminder_communication.sql");
const adminNoticeMigration = read("../supabase/migrations/20261010120000_pre_event_admin_notifications.sql");
const cronRoute = read("../app/api/cron/pre-event-reminders/route.ts");

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
  eventName: "Matrimonio Josefina",
  eventDate: "2026-05-15",
  daysUntilEvent: 10,
  eventLocation: "Centro de Eventos · Santiago",
  serviceStartAt: "2026-05-15T22:00:00Z",
  operatorArrivalAt: null,
  assemblyStartAt: null,
  reservationConfirmed: true,
  scrapbookIncluded: false,
  photoDesignRequired: false,
  photoDesignApproved: false,
  photoDesignPending: false,
  payment: null,
  bankCopyUrl: null,
  website: "https://www.bbox.cl",
};

test("global Event action opens the canonical MobileDialog composer", () => {
  assert.match(workspace, /label="ENVIAR CORREO PREEVENTO"/);
  assert.match(workspace, /openTabAndScroll\("COMMUNICATIONS", "pre-event-reminder"\)/);
  assert.match(workspace, /<PreEventReminderControl/);
  assert.match(control, /<MobileDialog/);
  for (const field of ["PARA", "CC", "ASUNTO", "VISTA PREVIA"]) {
    assert.match(control, new RegExp(field));
  }
});

test("one renderer is global for Matrimonio, Social, Empresa and future Event types", () => {
  for (const eventType of ["Matrimonio", "Social", "Empresa", "Festival futuro"]) {
    const html = renderPreEventReminderHtml({ ...base, customerName: eventType });
    assert.match(html, /¡QUEDA MUY POCO PARA TU EVENTO!/);
    assert.match(html, new RegExp(eventType));
  }
  assert.doesNotMatch(service, /switch\s*\(.*project_type/);
  assert.doesNotMatch(service, /project_type\s*===\s*["'](?:Wedding|Corporate|Birthday)/);
});

test("D-10 event status uses informative service and design copy while payment stays dynamic", () => {
  const html = renderPreEventReminderHtml({ ...base, photoDesignRequired: true });
  const text = buildPreEventReminderText({ ...base, photoDesignRequired: true });
  for (const output of [html, text]) {
    assert.match(output, /Servicio: Confirmar horario del servicio|>Servicio</);
    assert.match(output, /Diseño: Confirmar tu diseño|>Diseño</);
  }
  assert.match(html, />Pago<|Pago/);
  assert.match(service, /daysUntilEvent !== 10/);
});

test("canonical Event date is validated and formatted in Spanish", () => {
  assert.equal(formatPreEventDate("2026-05-15"), "15 de mayo de 2026");
  assert.equal(
    defaultPreEventReminderSubject("2026-05-15"),
    "¡Queda muy poco para tu evento! · BOOMBOX · 15 de mayo de 2026",
  );
  assert.throws(() => formatPreEventDate("2026-02-30"), /fecha canónica válida/);
  assert.match(service, /event_date/);
});

test("automatic delivery is exactly D-10 while manual sending stays available", () => {
  assert.equal(daysUntilPreEvent("2026-05-15", new Date("2026-05-05T16:00:00Z")), 10);
  assert.match(service, /composer\.daysUntilEvent !== 10/);
  assert.match(service, /\.eq\("event_date", targetDate\)/);
  assert.doesNotMatch(service, /\.gte\("event_date", today\)/);
  assert.doesNotMatch(service, /automatic-d10-recovery/);
  assert.match(service, /sendAutomaticPreEventReminders/);
  assert.doesNotMatch(actions, /daysUntilEvent\s*[!=<>]=?\s*10/);
});

test("cron execution is observable without exposing message content or secrets", () => {
  const route = read("../app/api/cron/pre-event-reminders/route.ts");
  assert.match(route, /pre_event_reminder\.cron_started/);
  assert.match(route, /pre_event_reminder\.cron_completed/);
  assert.match(route, /pre_event_reminder\.cron_failed/);
  assert.match(route, /durationMs/);
  assert.doesNotMatch(route, /htmlBody|textBody|CRON_SECRET\s*:/);
});

test("dry run is read-only, authenticated, and unavailable in Production", () => {
  const route = read("../app/api/cron/pre-event-reminders/route.ts");
  const service = read("../features/connectors/google-gmail/application/pre-event-reminder.service.ts");
  const inspection = service.slice(service.indexOf("export async function inspectAutomaticPreEventReminders"));
  assert.match(route, /authorization[\s\S]*Bearer/);
  assert.match(route, /D10_DRY_RUN !== "true"/);
  assert.match(route, /VERCEL_ENV === "production"/);
  assert.match(route, /inspectAutomaticPreEventReminders/);
  assert.match(service, /dryRun: true/);
  assert.doesNotMatch(inspection, /sendPreEventReminder/);
  assert.doesNotMatch(inspection, /\.(insert|update)\(/);
});

test("cron follows 11:00 America/Santiago across DST by using an hourly schedule gate", () => {
  const config = read("../vercel.json");
  const route = read("../app/api/cron/pre-event-reminders/route.ts");
  assert.match(config, /"path": "\/api\/cron\/pre-event-reminders",\s*"schedule": "0 \* \* \* \*"/);
  assert.match(route, /timeZone: "America\/Santiago"/);
  assert.match(route, /chileHour\(\) !== 11/);
});

test("automatic D-10 requires a confirmed reservation or synchronized calendar event", () => {
  assert.match(service, /if \(!composer\.eventConfirmed\)/);
  assert.match(service, /calendar_sync/);
  assert.match(service, /status === "SYNCHRONIZED"/);
  assert.match(service, /external_event_id/);
  assert.match(service, /Evento no está confirmado por reserva ni por calendario sincronizado/);
  assert.match(
    service.slice(service.indexOf("export async function inspectAutomaticPreEventReminders")),
    /composer\.eventConfirmed/,
  );
});

test("unknown Gmail outcomes remain pending and block a second attempt", () => {
  assert.match(service, /GoogleGmailDeliveryOutcomeUnknownError/);
  assert.match(service, /status: "PENDING"/);
  assert.match(service, /Existe un intento de envío sin resultado confirmado/);
});

test("manual action recovers visibly when the Server Action has no response", () => {
  assert.match(control, /try \{/);
  assert.match(control, /catch \(error\)/);
  assert.match(control, /submissionGate\.current = false/);
  assert.match(control, /setSendState\(\{\s*status: "error"/);
  assert.match(control, /finally \{/);
  assert.match(control, /PRE_EVENT_ACTION_TIMEOUT_MS = 15_000/);
  assert.match(control, /La vista previa está tardando demasiado/);
  assert.match(control, /El envío está tardando demasiado/);
});

test("preview composer isolates every dependency and emits only safe timing fields", () => {
  for (const step of [
    "project",
    "accounts_receivable_projection",
    "crm_reservations",
    "calendar_sync",
    "communications",
    "company_settings",
  ]) {
    assert.match(service, new RegExp(`withPreEventComposerStep\\(\\"${step}\\"`));
  }
  assert.match(service, /PRE_EVENT_COMPOSER_STEP_TIMEOUT_MS = 8_000/);
  assert.match(service, /pre_event_reminder\.composer_step/);
  assert.match(service, /pre_event_reminder\.composer_step_failed/);
  assert.match(service, /pre_event_reminder\.composer_completed/);
  assert.match(service, /loadCompanySettingsCached/);
  assert.doesNotMatch(service, /loadCompanySettings\(admin\)/);
  assert.doesNotMatch(
    service,
    /event: "pre_event_reminder\.composer_step"[\s\S]{0,320}(customerName|to_recipient|external_message_id|projectId)/,
  );
  assert.match(actions, /pre_event_reminder\.auth_step/);
  assert.match(actions, /auth\.getUser/);
  assert.match(actions, /profiles\.role/);
});

test("cron authorization is exact and Chile 11:00 is DST-safe", () => {
  const config = read("../vercel.json");
  assert.match(cronRoute, /authorization.*Bearer/);
  assert.match(cronRoute, /function isAuthorizedCronRequest/);
  assert.match(cronRoute, /timeZone: "America\/Santiago"/);
  assert.match(cronRoute, /chileHour\(\) !== 11/);
  assert.match(config, /"schedule": "0 \* \* \* \*"/);
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
      customerType: "PRIVATE",
      bankDetails,
    },
  };
  const html = renderPreEventReminderHtml({ ...model, bankCopyUrl: "https://app.bbox.cl/datos-bancarios" });
  assert.match(html, /Segundo pago \/ saldo final/i);
  assert.match(html, /COPIAR DATOS BANCARIOS/);
  assert.match(html, /https:\/\/app\.bbox\.cl\/datos-bancarios/);
  assert.match(html, /\$750\.000/);
  assert.match(html, /12 de mayo de 2026/);
  assert.match(html, /Banco BCI/);
  assert.match(html, /contabilidad@bbox\.cl/);
  assert.ok(html.indexOf("Todo coordinado") < html.indexOf("Segundo pago"));
  assert.doesNotMatch(html, /50\s*%|0\.5\s*\*/);
});

test("bank copy link opens the public page safely from the email and preview iframe", () => {
  const html = renderPreEventReminderHtml({
    ...base,
    payment: {
      projectionId: "projection-bank-link",
      outstandingBalance: 120_000,
      dueDate: "2026-05-12",
      customerType: "PRIVATE",
      bankDetails,
    },
    bankCopyUrl: "https://app.bbox.cl/datos-bancarios",
  });
  assert.match(
    html,
    /href="https:\/\/app\.bbox\.cl\/datos-bancarios"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );
  assert.doesNotMatch(html, /javascript:|data:text\/html/i);
  assert.match(control, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(control, /sandbox="allow-scripts/);
  assert.match(middleware, /pathname === "\/datos-bancarios"/);
});

test("positive D-10 balance is visually emphasized while zero balance stays paid", () => {
  const positive = renderPreEventReminderHtml({
    ...base,
    payment: {
      projectionId: "projection-positive",
      outstandingBalance: 162_500,
      dueDate: "2026-05-12",
      customerType: "PRIVATE",
      bankDetails,
    },
  });
  assert.match(positive, /Saldo pendiente/);
  assert.match(positive, /font-size:30px;font-weight:800;line-height:1\.15/);
  assert.match(positive, /\$162\.500/);

  const zero = renderPreEventReminderHtml(base);
  assert.match(zero, /Pago/);
  assert.match(zero, /✓ AL DÍA/);
  assert.doesNotMatch(zero, /Saldo pendiente/);
});

test("Scrapbook and photo design blocks obey actual conditions", () => {
  const empty = renderPreEventReminderHtml(base);
  assert.doesNotMatch(empty, /Tu Scrapbook/);
  assert.doesNotMatch(empty, /Diseño de tus fotos/);
  const included = renderPreEventReminderHtml({
    ...base,
    scrapbookIncluded: true,
    photoDesignRequired: true,
    photoDesignApproved: false,
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
    "¡QUEDA MUY POCO PARA TU EVENTO!",
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

test("automatic D-10 notifies the administrator independently and idempotently", () => {
  assert.match(service, /matias\.maira\.larrain@gmail\.com/);
  assert.match(service, /PRE_EVENT_REMINDER_ADMIN_NOTICE/);
  assert.match(service, /pre-event-admin:\$\{input\.projectId\}:\$\{input\.eventDate\}:\$\{input\.result\}/);
  assert.match(service, /result: "SENT"/);
  assert.match(service, /result: "FAILED"/);
  assert.match(service, /admin_notice_failed/);
  assert.match(adminNoticeMigration, /communications_pre_event_admin_notice_request_uidx/);
  assert.match(adminNoticeMigration, /PRE_EVENT_REMINDER_ADMIN_NOTICE/);
});

test("send path does not mutate Finance, Drive, Calendar or WhatsApp", () => {
  assert.doesNotMatch(service, /invoice_payments|payment_ledger|drive_sync|whatsapp/i);
  assert.match(service, /driveFileIds: \[\]/);
  assert.doesNotMatch(actions, /calendar|drive|whatsapp/i);
});

test("HTML is Gmail-safe, centered, and constrained for 390px mobile", () => {
  const html = renderPreEventReminderHtml({ ...base, payment: {
    projectionId: "projection-1",
    outstandingBalance: 123_456,
    dueDate: "2026-05-12",
    customerType: "PRIVATE",
    bankDetails,
  } });
  assert.match(html, /name="viewport"/);
  assert.match(html, /max-width:640px/);
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
    payment: { projectionId: "p", outstandingBalance: 1, dueDate: null, customerType: "PRIVATE", bankDetails },
  }));
});
