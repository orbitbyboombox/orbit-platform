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
const formalDocument = source("features/commercial-hub/formal-quote-document.ts");
const formalRoute = source("app/api/commercial/quotes/[quoteId]/pdf/route.ts");
const deliveryMetadata = source("supabase/migrations/0180_reservation_confirmation_delivery_metadata.sql");
const timelineRepair = source("supabase/migrations/0181_reservation_confirmation_timeline_repair.sql");

const templateInput = {
  customer: { fullName: "Jenniffer Chavez", metadata: {} },
  eventName: "Evento corporativo de Fiestas Patrias",
  eventDate: "2026-09-14",
  eventTime: "14:00:00",
  venue: "Av Vitacura 2680",
  city: "Las Condes",
  serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
  commercialItems: [
    {
      code: "CLASSIC",
      label: "Classic 3 horas 5x15cms",
      itemType: "SERVICE",
      total: 290000,
    },
    {
      code: "UNLIMITED_MAGNETS",
      label: "Imanes ilimitados GRATIS",
      itemType: "SERVICE",
      total: 0,
    },
  ],
  serviceStartAt: "2026-09-14T17:00:00Z",
  serviceEndAt: "2026-09-14T20:00:00Z",
  eventDurationHours: 3,
  serviceDurations: [3, 3],
  transport: 0,
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
  assert.match(service, /to: input\.to \?\? composer\.to/);
  assert.doesNotMatch(service, /accepted_snapshot[\s\S]{0,120}\.email/);
  assert.doesNotMatch(service, /auth\.user\.email|session\.user\.email/);
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
  assert.match(ui, /¿Enviar nuevamente la confirmación a \{to\}\?/);
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
  assert.match(service, /customerCommercialItemsFromSnapshot/);
  assert.match(service, /quotation\?\.final_customer_price/);
});

test("11 customer template uses commercial labels without enum leakage", () => {
  const rendered = buildReservationConfirmationTemplate(templateInput);
  assert.match(rendered.body, /Servicio: Classic · 3 horas/);
  assert.match(rendered.body, /Extras: Imanes ilimitados · Gratis/);
  assert.doesNotMatch(rendered.body, /CLASSIC|UNLIMITED_MAGNETS/);
  assert.match(rendered.subject, /¡Tu reserva BOOMBOX está confirmada!/);
});

test("12 customer template uses one canonical event duration", () => {
  const rendered = buildReservationConfirmationTemplate(templateInput);
  assert.match(rendered.body, /Servicio: Classic · 3 horas/);
  assert.doesNotMatch(rendered.body, /3 h \+ 3 h|3 horas \+ 3 horas|3 horas, 3 horas/);
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

test("15b PARA and CC are editable temporary recipients without CRM mutation", () => {
  assert.match(ui, /setTo\(result\.preview\.to\)/);
  assert.match(ui, /onChange=\{\(event\) => setTo\(event\.target\.value\)\}/);
  assert.match(ui, /type="email" value=\{to\}/);
  assert.match(ui, /formData\.set\("to", to\)/);
  assert.match(ui, /setCc\(event\.target\.value\)/);
  assert.match(actions, /to: String\(formData\.get\("to"\) \?\? ""\)/);
  assert.doesNotMatch(`${actions}\n${service}`, /secondary_email:\s*(recipients|input)|\.from\("customers"\)\.update/);
});

test("15c missing or invalid TO blocks send without Founder fallback", () => {
  assert.match(ui, /!to\.trim\(\)/);
  assert.match(ui, /No existe un email válido del cliente para enviar la confirmación/);
  assert.match(service, /normalizeEmailRecipients\(\{ to: input\.to \?\? composer\.to/);
  assert.doesNotMatch(`${ui}\n${actions}\n${service}`, /auth\.user\.email|session\.user\.email/);
});

test("15d provider payload and history use the displayed final TO and CC", () => {
  assert.match(service, /to_recipient: recipients\.to/);
  assert.match(service, /cc_recipients: recipients\.cc/);
  assert.match(service, /sender\.send\(\{[\s\S]*to: recipients\.to,[\s\S]*cc: recipients\.cc/);
  assert.match(service, /recipient: recipients\.to/);
  assert.match(service, /ccRecipients: recipients\.cc/);
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

test("19 Empresa attaches the stored formal document or the canonical accepted quotation", () => {
  assert.match(service, /loadReservationCommercialDocument\(admin/);
  assert.match(service, /attachments: document/);
  assert.match(service, /mimeType: document\.mimeType/);
  assert.match(service, /content: document\.bytes/);
  assert.match(formalRoute, /loadFormalQuoteDocument\(client, quoteId\)/);
  assert.match(formalDocument, /accepted_snapshot/);
  assert.match(formalDocument, /createFormalQuotePdf/);
  assert.match(formalDocument, /quoteDisplayFilename/);
  assert.match(formalDocument, /agreements/);
  assert.match(formalDocument, /orbit-documents/);
  assert.match(formalDocument, /!== "%PDF"/);
});

test("20 communication history records attachment and non-secret portal destination", () => {
  assert.match(service, /commercial_document_reference: composer\.attachmentFilename/);
  assert.match(service, /portal_destination_type: portalCtaRequested/);
  assert.match(deliveryMetadata, /commercial_document_reference text/);
  assert.match(deliveryMetadata, /portal_destination_type text/);
  assert.doesNotMatch(deliveryMetadata, /token_hash|session_token|access_token/);
});

test("21 customer portal CTA uses a credential-free route and never Founder navigation", () => {
  assert.match(service, /const portalLoginUrl/);
  assert.match(service, /\/portal`/);
  assert.doesNotMatch(service, /appProjectUrl|\/projects\/\$\{|\/p\/\$\{|customer_portal_tokens\([^)]*token/);
});

test("22 formal email work cannot mutate finance, credit or payment truth", () => {
  const changed = `${service}\n${formalDocument}\n${deliveryMetadata}`;
  assert.doesNotMatch(changed, /from\("invoice_payments"\)|from\("accounts_receivable/);
  assert.doesNotMatch(changed, /\.update\(\{[^}]*(paid_amount|outstanding_balance|due_date|payment_term)/);
});

test("23 provider emits a real PDF MIME attachment", async () => {
  const originalFetch = globalThis.fetch;
  let raw = "";
  globalThis.fetch = async (_input, init) => {
    raw = String(JSON.parse(String(init?.body)).raw);
    return new Response(JSON.stringify({ id: "message-pdf", threadId: "thread-pdf" }), {
      status: 200,
    });
  };
  try {
    await new GoogleGmailApiProvider("token").send({
      to: "cliente@empresa.cl",
      cc: ["compras@empresa.cl"],
      idempotencyKey: "empresa-confirmation-pdf",
      subject: "Reserva confirmada",
      textBody: "Reserva confirmada",
      htmlBody: "<p>Reserva confirmada</p>",
      driveFileIds: [],
      attachments: [
        {
          filename: "Cotización BOOMBOX 2026-826.pdf",
          mimeType: "application/pdf",
          content: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
        },
      ],
    });
    const padded = raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const mime = Buffer.from(padded, "base64").toString("utf8");
    assert.match(mime, /Content-Type: multipart\/mixed/);
    assert.match(mime, /Content-Type: application\/pdf/);
    assert.match(mime, /Content-Disposition: attachment; filename="Cotización BOOMBOX 2026-826\.pdf"/);
    assert.match(mime, /JVBERg==/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("24 sent confirmation Timeline persists the canonical Event identity", () => {
  assert.match(service, /id,customer_id,orbit_event_id,name/);
  assert.match(service, /orbitEventId: project\.orbit_event_id/);
  assert.match(service, /from\("timeline_events"\)\.insert\(\{[\s\S]*orbit_event_id: composer\.orbitEventId/);
});

test("25 missing confirmation Timeline rows are repaired globally without resending or finance writes", () => {
  assert.match(timelineRepair, /from public\.communications c/);
  assert.match(timelineRepair, /join public\.projects p on p\.id = c\.project_id/);
  assert.match(timelineRepair, /p\.orbit_event_id/);
  assert.match(timelineRepair, /not exists/);
  assert.doesNotMatch(timelineRepair, /invoice_payments|receivable_movements|paid_amount|send\(/);
  assert.doesNotMatch(timelineRepair, /where c\.project_id\s*=|where c\.customer_id\s*=/);
});
