import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  renderReservationConfirmationDelivery,
  renderReservationConfirmationHtml,
} from "../features/connectors/google-gmail/application/reservation-confirmation.html.ts";
import { buildReservationConfirmationTemplate } from "../features/connectors/google-gmail/application/reservation-confirmation.template.ts";
import {
  founderPaymentStatusLabel,
  renderFounderReservationNotification,
} from "../features/connectors/google-gmail/application/reservation-notification.presentation.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const customerService = source(
  "features/connectors/google-gmail/application/reservation-confirmation.service.ts",
);
const delivery = source(
  "features/connectors/google-gmail/application/google-gmail-delivery.service.ts",
);
const booking = source(
  "features/automatic-booking/complete-automatic-booking.service.ts",
);

const customerInput = (eventName: string, companyCommercial = false) => ({
  customer: { fullName: "Cliente BOOMBOX", metadata: {} },
  eventName,
  eventDate: "2027-01-15",
  eventTime: "22:30:00",
  venue: "Casona El Cruceral",
  city: "Pirque",
  serviceCodes: ["BLACK_STUDIO"],
  commercialItems: [
    {
      code: "BLACK_STUDIO",
      label: "Black Studio",
      itemType: "SERVICE",
      total: 470_000,
    },
    {
      code: "SCRAPBOOK",
      label: "Scrapbook GRATIS",
      itemType: "EXTRA",
      total: 0,
    },
  ],
  eventDurationHours: 3,
  serviceDurations: [3],
  transport: 70_000,
  total: 540_000,
  paid: 270_000,
  balance: 270_000,
  portalAvailable: true,
  companyCommercial,
});

test("automatic customer email has one premium template for every Event type", () => {
  for (const eventName of [
    "Matrimonio",
    "Evento Empresa",
    "Cumpleaños",
    "Evento social",
  ]) {
    const template = buildReservationConfirmationTemplate(
      customerInput(eventName, eventName === "Evento Empresa"),
    );
    const html = renderReservationConfirmationHtml(
      template.body,
      "https://www.bbox.cl",
      {
        companyCommercial: eventName === "Evento Empresa",
        portalUrl: "https://orbit.boom-box.cl/portal",
      },
    );
    assert.match(html, /RESERVA CONFIRMADA/);
    assert.match(html, /BIENVENIDOS A BOOMBOX/);
    assert.match(html, /SERVICIO CONTRATADO/);
    assert.match(html, /INFORMACIÓN DEL EVENTO/);
  }
});

test("legacy plain customer renderer is absent from the shared flow", () => {
  const html = renderReservationConfirmationHtml(
    buildReservationConfirmationTemplate(customerInput("Matrimonio")).body,
    "https://www.bbox.cl",
    { companyCommercial: false, portalUrl: "https://orbit.boom-box.cl/portal" },
  );
  assert.match(html, /EXPERIENCIAS QUE CONECTAN/);
  assert.doesNotMatch(html, /background:#f6f4ef|<main style=/);
});

test("customer total, paid amount and balance are rendered from supplied canonical truth", () => {
  const body = buildReservationConfirmationTemplate(customerInput("Matrimonio")).body;
  assert.match(body, /Valor total\n\$540\.000/);
  assert.match(body, /Abono recibido\n\$270\.000/);
  assert.match(body, /Saldo pendiente\n\$270\.000/);
  assert.doesNotMatch(body, /Abono recibido\n\$0/);
});

test("customer composer reads all financial values from financial_event_records", () => {
  assert.match(customerService, /financial_event_records\(invoiced_amount,paid_amount,outstanding_balance\)/);
  assert.match(customerService, /total = Number\(financial\.invoiced_amount\)/);
  assert.match(customerService, /paid = Number\(financial\.paid_amount\)/);
  assert.match(customerService, /balance = Number\(financial\.outstanding_balance\)/);
  assert.doesNotMatch(customerService, /paid: Number\(financial\?\./);
});

test("missing or inconsistent canonical finance blocks misleading email", () => {
  assert.match(customerService, /No existe verdad financiera canónica/);
  assert.match(customerService, /Math\.abs\(total - paid - balance\) > 1/);
  assert.match(delivery, /Math\.abs\(amount-paid-balance\)>1/);
});

test("Founder backup uses the premium BOOMBOX family", () => {
  const rendered = renderFounderReservationNotification({
    projectId: "project-1",
    projectUrl: "https://orbit.boom-box.cl/projects/project-1",
    orbitEventId: "ORB-2027-1",
    quotationNumber: "2027-001",
    customer: { fullName: "Cliente BOOMBOX" },
    serviceCodes: ["BLACK_STUDIO"],
    serviceDurations: [3],
    eventDurationHours: 3,
    eventDate: "2027-01-15",
    amount: 540_000,
    paid: 270_000,
    balance: 270_000,
    customerType: "Particular",
    contractStatus: "SIGNED",
    integrations: [{ label: "Google Drive", ready: true }],
    website: "https://www.bbox.cl",
  });
  assert.match(rendered.htmlBody, /CONFIRMACIÓN INTERNA/);
  assert.match(rendered.htmlBody, /NUEVA RESERVA CONFIRMADA/);
  assert.match(rendered.htmlBody, /ESTADO OPERACIONAL/);
  assert.match(rendered.htmlBody, /ABRIR EVENTO EN ORBIT/);
  assert.match(rendered.htmlBody, /BOOMBOX · Comunicación emitida mediante ORBIT/);
  assert.match(rendered.textBody, /Fecha del evento: 15 de enero de 2027/);
  assert.match(rendered.textBody, /Pago recibido: \$270\.000/);
  assert.match(rendered.textBody, /Saldo: \$270\.000/);
  assert.doesNotMatch(rendered.htmlBody + rendered.textBody, /RESERVATION_RECEIVED/);
});

test("Founder payment labels are human-readable and ledger-derived", () => {
  assert.equal(founderPaymentStatusLabel({ total: 540_000, paid: 0, balance: 540_000 }), "Pago pendiente");
  assert.equal(founderPaymentStatusLabel({ total: 540_000, paid: 270_000, balance: 270_000 }), "Pago parcial");
  assert.equal(founderPaymentStatusLabel({ total: 540_000, paid: 540_000, balance: 0 }), "Pagado");
});

test("Founder delivery reads canonical finance and records its actual recipient", () => {
  assert.match(delivery, /from\("financial_event_records"\)/);
  assert.match(delivery, /to_recipient:recipient/);
  assert.match(delivery, /sent_at:sentAt/);
  assert.doesNotMatch(delivery, /finance\.paymentStatus|RESERVATION_RECEIVED/);
});

test("signed contract state is independent from asynchronous Drive archival", () => {
  assert.match(delivery, /agreement\?\.status === "SIGNED" \? "SIGNED" : "PENDING"/);
  assert.doesNotMatch(delivery, /agreement\?\.drive_file_id/);
});

test("customer and Founder audiences remain separate", () => {
  assert.match(customerService, /to: input\.to \?\? composer\.to/);
  assert.match(delivery, /founderNotificationEmail/);
  assert.match(delivery, /communication_type: "INTERNAL_NOTIFICATION"/);
  assert.match(customerService, /communication_type: "RESERVATION_CONFIRMATION"/);
});

test("recipient, CC, Portal CTA and Empresa attachment behavior are preserved", () => {
  assert.match(customerService, /customer\.secondary_email \? \[customer\.secondary_email\] : \[\]/);
  assert.match(customerService, /portalLoginUrl/);
  assert.match(customerService, /loadReservationCommercialDocument/);
  assert.match(customerService, /attachments: document/);
});

test("automatic booking commits ledger truth before rendering both emails", () => {
  assert.ok(
    booking.indexOf('rpc("register_automatic_booking_deposit"') <
      booking.indexOf("confirmPersistedReservation({"),
  );
});

test("customer and Founder automatic sends retain deterministic deduplication", () => {
  assert.match(customerService, /requestId: string/);
  assert.match(customerService, /idempotencyKey: requestKey/);
  assert.match(delivery, /requestId: "automatic"/);
  assert.match(delivery, /founder-reservation:\$\{input\.projectId\}/);
});

test("email hotfix contains no customer or Event-specific branching", () => {
  const changed = customerService + delivery;
  assert.doesNotMatch(changed, /Christiane|Tannen|2026-835|a85794c2|ORB-2027-487862/i);
});

test("browser CRLF edits retain Photo 2 structured rows, orange hierarchy and CTA", () => {
  const template = buildReservationConfirmationTemplate(customerInput("Matrimonio"));
  const browserBody = template.body.replaceAll("\n", "\r\n");
  const { htmlBody } = renderReservationConfirmationDelivery({
    body: browserBody,
    website: "https://www.bbox.cl",
    companyCommercial: false,
    portalCtaAvailable: true,
    portalUrl: "https://orbit.boom-box.cl/portal",
  });
  for (const label of ["Servicio", "Duración", "Extras", "Fecha", "Horario", "Lugar"])
    assert.match(htmlBody, new RegExp(`<td[^>]*>${label}</td>`));
  for (const section of ["SERVICIO CONTRATADO", "INFORMACIÓN DEL EVENTO", "VALOR DEL SERVICIO CONTRATADO"])
    assert.match(htmlBody, new RegExp(`color:#e67800[^>]*>${section}</h2>`));
  assert.doesNotMatch(htmlBody, /<p[^>]*>Servicio<br>/);
  assert.equal((htmlBody.match(/ABRIR EVENTO EN ORBIT/g) ?? []).length, 1);
  assert.match(htmlBody, /<td[^>]*background:#f78900[^>]*><a href="https:\/\/orbit\.boom-box\.cl\/portal"/);
});

test("canonical total is prominent and is not degraded to a loose labeled block", () => {
  const html = renderReservationConfirmationHtml(
    buildReservationConfirmationTemplate(customerInput("Evento social")).body,
    "https://www.bbox.cl",
    { companyCommercial: false, portalUrl: "https://orbit.boom-box.cl/portal" },
  );
  assert.match(html, /font-size:28px[^>]*>\$540\.000</);
  assert.doesNotMatch(html, /<td[^>]*>Valor total<\/td>/);
});

test("unavailable portal never degrades the CTA marker into plain HTML text", () => {
  const html = renderReservationConfirmationDelivery({
    body: `${buildReservationConfirmationTemplate(customerInput("Cumpleaños")).body}\r\n\r\nABRIR EVENTO EN ORBIT`,
    website: "https://www.bbox.cl",
    companyCommercial: false,
    portalCtaAvailable: false,
    portalUrl: null,
  }).htmlBody;
  assert.doesNotMatch(html, /ABRIR EVENTO EN ORBIT/);
});

test("Founder preview and provider use the same canonical delivery renderer", () => {
  const ui = source("features/projects/signing/agreement-signing-control.tsx");
  assert.match(customerService, /const rendered = renderReservationConfirmationDelivery\(\{/);
  assert.match(customerService, /htmlBody: rendered\.htmlBody/);
  assert.match(ui, /const previewHtml = composer[\s\S]*renderReservationConfirmationDelivery\(\{/);
  assert.match(ui, /srcDoc=\{previewHtml\}/);
});

test("automatic, manual, quote conversion and resend converge on one customer sender", () => {
  const orchestrator = source("features/projects/operations/confirmed-reservation-orchestrator.service.ts");
  const actions = source("features/projects/actions/customer.actions.ts");
  const commercial = source("features/commercial-hub/actions.ts");
  assert.match(delivery, /sendReservationConfirmation\(\{/);
  assert.match(actions, /sendReservationConfirmation\(\{/);
  assert.match(orchestrator, /deliverConfirmedReservationEmail/);
  assert.match(commercial, /createCustomerProjectAction\(draft\)/);
  assert.match(actions, /confirmPersistedReservation\(\{/);
  assert.doesNotMatch(`${delivery}\n${actions}\n${orchestrator}\n${commercial}`, /renderReservationConfirmationHtml\(/);
});
