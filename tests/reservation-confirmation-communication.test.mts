import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReservationConfirmationTemplate } from "../features/connectors/google-gmail/application/reservation-confirmation.template.ts";
import { GoogleGmailApiProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = source("features/connectors/google-gmail/application/reservation-confirmation.service.ts");
const delivery = source("features/connectors/google-gmail/application/google-gmail-delivery.service.ts");
const orchestrator = source("features/projects/operations/confirmed-reservation-orchestrator.service.ts");
const actions = source("features/projects/actions/customer.actions.ts");
const ui = source("features/projects/signing/agreement-signing-control.tsx");
const migration = source("supabase/migrations/0172_reservation_confirmation_history.sql");
const projectPage = source("app/(platform)/projects/[projectId]/page.tsx");

const templateInput = {
  customer: { fullName: "Jenniffer Chavez", metadata: {} },
  eventName: "Evento corporativo de Fiestas Patrias",
  eventDate: "2026-09-14",
  eventTime: "14:00:00",
  venue: "Av Vitacura 2680",
  city: "Las Condes",
  serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
  commercialLabels: ["Classic 3 horas 5x15cms", "Imanes ilimitados GRATIS"],
  serviceStartAt: "2026-09-14T17:00:00Z",
  serviceEndAt: "2026-09-14T20:00:00Z",
  eventDurationHours: 3,
  serviceDurations: [3, 3],
  total: 345100,
  paid: 0,
  balance: 345100,
  portalAvailable: true,
};

test("1 internal Founder notification is not the customer confirmation", () => {
  assert.match(delivery, /communication_type", "INTERNAL_NOTIFICATION"/);
  assert.match(service, /communication_type", "RESERVATION_CONFIRMATION"/);
  assert.match(ui, /Estado independiente de la reserva y de las notificaciones internas/);
});

test("2 manual confirmation uses current canonical TO", () => {
  assert.match(service, /customers!inner\(full_name,email,secondary_email,metadata\)/);
  assert.match(service, /normalizeEmailRecipients\(\{ to: composer\.to/);
  assert.doesNotMatch(service, /accepted_snapshot[\s\S]{0,120}\.email/);
});

test("3 certified secondary email is suggested as CC and remains editable", () => {
  assert.match(service, /customer\.secondary_email \? \[customer\.secondary_email\] : \[\]/);
  assert.match(ui, /Se propone el email secundario certificado/);
  assert.match(ui, /setCc\(event\.target\.value\)/);
});

test("4 every confirmation attempt persists complete history", () => {
  for (const field of ["to_recipient", "cc_recipients", "sent_at", "sent_by", "external_message_id", "failure_reason", "original_communication_id"]) assert.match(`${service}\n${migration}`, new RegExp(field));
  assert.match(ui, /data-reservation-confirmation-history/);
});

test("5 Event exposes NUNCA ENVIADA, ENVIADA and FALLIDA", () => {
  for (const label of ["NUNCA ENVIADA", "ENVIADA", "FALLIDA"]) assert.match(ui, new RegExp(label));
  assert.match(service, /"NEVER_SENT" \| "SENT" \| "FAILED"/);
});

test("6 manual resend requires immediate explicit confirmation", () => {
  assert.match(ui, /¿Enviar nuevamente la confirmación a \{composer\.to\}\?/);
  assert.match(ui, /Sí, enviar nuevamente/);
  assert.match(actions, /confirmResend: formData\.get\("confirmResend"\) === "true"/);
});

test("7 duplicate clicks and requests produce at most one provider send", () => {
  assert.match(ui, /if \(!composer \|\| sending \|\| sendState\.status === "success"\) return/);
  assert.match(migration, /unique index[\s\S]*request_key/);
  assert.match(service, /insertError\.code === "23505"/);
});

test("8 provider retry carries a stable idempotency identity", async () => {
  const originalFetch = globalThis.fetch;
  let raw = "";
  globalThis.fetch = async (_input, init) => {
    raw = String(JSON.parse(String(init?.body)).raw);
    return new Response(JSON.stringify({ id: "message-1", threadId: "thread-1" }), { status: 200 });
  };
  try {
    await new GoogleGmailApiProvider("token").send({ to: "cliente@empresa.cl", idempotencyKey: "reservation-confirmation:event:attempt", subject: "Confirmación", textBody: "Mensaje", htmlBody: "<p>Mensaje</p>", driveFileIds: [] });
    const padded = raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const mime = Buffer.from(padded, "base64").toString("utf8");
    assert.match(mime, /^Message-ID: <reservation-confirmation-event-attempt@orbit\.boom-box\.cl>$/m);
    assert.match(mime, /^X-ORBIT-Idempotency-Key: reservation-confirmation-event-attempt$/m);
  } finally { globalThis.fetch = originalFetch; }
});

test("9 provider failure is recorded without invalidating a reservation", () => {
  assert.match(service, /status: "FAILED", failure_reason: failureReason/);
  assert.match(orchestrator, /await boundary\("CUSTOMER_EMAIL"/);
  assert.match(orchestrator, /warnings\.push/);
  assert.doesNotMatch(service, /from\("projects"\)\.update|from\("crm_reservations"\)\.update/);
});

test("10 current customer contact is used while accepted commercial values stay fixed", () => {
  assert.match(service, /customer: \{ fullName: customer\.full_name, metadata: customer\.metadata \}/);
  assert.match(service, /commercialLabels\(quotation\?\.accepted_snapshot\)/);
  assert.match(service, /quotation\?\.final_customer_price/);
});

test("11 customer template uses commercial labels without enum leakage", () => {
  const rendered = buildReservationConfirmationTemplate(templateInput);
  assert.match(rendered.body, /Classic 3 horas 5x15cms \+ Imanes ilimitados GRATIS/);
  assert.doesNotMatch(rendered.body, /CLASSIC|UNLIMITED_MAGNETS/);
  assert.match(rendered.subject, /¡Tu reserva BOOMBOX está confirmada!/);
});

test("12 customer template uses one canonical event duration", () => {
  const rendered = buildReservationConfirmationTemplate(templateInput);
  assert.match(rendered.body, /Duración: 3 horas/);
  assert.doesNotMatch(rendered.body, /3 h \+ 3 h|3 horas \+ 3 horas/);
});

test("13 Payment Ledger and Accounts Receivable remain read-only", () => {
  assert.doesNotMatch(migration, /invoice_payments|receivable_movements|accounts_receivable/i);
  assert.doesNotMatch(service, /from\("invoice_payments"\)|from\("receivable_movements"\)/);
  assert.doesNotMatch(service, /update\([\s\S]{0,100}(paid_amount|outstanding_balance)/);
});

test("14 quote conversion remains reservation-first and customer communication pending", () => {
  const commercialActions = source("features/commercial-hub/actions.ts");
  assert.match(commercialActions, /customerConfirmationMessage: "Confirmación cliente pendiente de envío"/);
  assert.match(orchestrator, /if\(input\.sendCustomerCommunication\)/);
});

test("15 every Event uses the certified fullscreen MobileDialog composer", () => {
  assert.match(ui, /<MobileDialog/);
  assert.match(ui, /variant="fullscreen-mobile"/);
  assert.match(ui, /PARA/);
  assert.match(ui, /ASUNTO/);
  assert.match(ui, /MENSAJE/);
});

test("16 reload persistence derives Gmail status only from customer confirmation", () => {
  assert.match(ui, /useEffect\(\(\) =>/);
  assert.match(service, /\.from\("communications"\)[\s\S]*RESERVATION_CONFIRMATION/);
  assert.match(projectPage, /item\.communication_type === "RESERVATION_CONFIRMATION"/);
});

test("17 success is shown only after confirmed provider response", () => {
  const providerSend = service.indexOf("const delivered = await sender.send");
  const successState = service.indexOf('status: "SENT"', providerSend);
  assert.ok(providerSend >= 0 && successState > providerSend);
  assert.match(ui, /✓ Confirmación enviada a/);
});

test("18 portal authentication secrets are not placed in customer CC", () => {
  assert.doesNotMatch(service, /createCustomerPortalAccess|portal\.url|customer_portal_tokens\([^)]*token/);
  assert.match(service, /customer_portal_tokens\(id\)/);
});
