import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCollectionEmailHtml,
  buildCollectionEmailDraft,
  collectionDraftFingerprint,
} from "../features/accounts-receivable/collection-email.template.ts";
import {
  collectionEventLocation,
  resolveCollectionEventDetail,
} from "../features/accounts-receivable/collection-event-detail.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const action = read("features/accounts-receivable/collection-email.actions.ts");
const composer = read("features/accounts-receivable/collection-email-composer.tsx");
const repository = read("features/accounts-receivable/repository.ts");

const bankDetails = {
  companyLabel: "BOOMBOX",
  bankName: "BCI",
  accountType: "Cuenta Corriente",
  accountNumber: "52093409",
  rut: "76.565.272-3",
  email: "contabilidad@boom-box.cl",
};

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "FAC-2026-826",
    customerName: "Jenniffer Chavez",
    customerEmail: "jfchavez@ccu.cl",
    customerSecondaryEmail: "produccion@ccu.cl",
    projectName: "2026-826",
    amount: 690_200,
    outstandingBalance: 345_100,
    dueDate: "2026-09-25",
    eventDate: "2026-09-14",
    eventLocation: "Centro de Eventos Las Condes · Santiago",
    service: "Classic + Imanes ilimitados",
    eventDuration: "3 horas",
    daysRemaining: 31,
    status: "PENDING" as const,
    collectionActions: [],
    ...overrides,
  };
}

test("collection event detail reuses commercial labels and canonical duration", () => {
  const detail = resolveCollectionEventDetail({
    eventDate: "2026-09-14",
    location: "Centro de Eventos Las Condes",
    city: "Santiago",
    operations: { durationHours: 3 },
    services: [
      { serviceCode: "CLASSIC", durationHours: 3 },
      { serviceCode: "UNLIMITED_MAGNETS", durationHours: 3 },
    ],
  });
  assert.equal(detail.service, "Classic + Imanes ilimitados");
  assert.equal(detail.eventDuration, "3 horas");
  assert.doesNotMatch(detail.service, /UNLIMITED_MAGNETS/);
  assert.doesNotMatch(detail.eventDuration, /3 horas\s*\+\s*3 horas/);
});

test("canonical operational window wins over duplicated service durations", () => {
  const detail = resolveCollectionEventDetail({
    operations: { durationHours: 8 },
    services: [
      { serviceCode: "CLASSIC", durationHours: 3 },
      { serviceCode: "UNLIMITED_MAGNETS", durationHours: 3 },
    ],
    operationalContract: {
      serviceStartAt: "2026-09-14T18:00:00-04:00",
      serviceEndAt: "2026-09-14T21:00:00-04:00",
    },
  });
  assert.equal(detail.eventDuration, "3 horas");
});

test("event location combines useful canonical fields and omits missing data", () => {
  assert.equal(
    collectionEventLocation({ location: "Hotel W", city: "Las Condes" }),
    "Hotel W · Las Condes",
  );
  assert.equal(collectionEventLocation({ location: null, city: null }), null);
  assert.equal(
    collectionEventLocation({ location: "Santiago", city: "Santiago" }),
    "Santiago",
  );
});

test("upcoming collection template includes complete event detail", () => {
  const draft = buildCollectionEmailDraft(invoice(), bankDetails);
  assert.equal(draft.templateKey, "UPCOMING");
  assert.match(draft.body, /FECHA\n14 de septiembre de 2026/);
  assert.match(draft.body, /LUGAR\nCentro de Eventos Las Condes · Santiago/);
  assert.match(draft.body, /SERVICIO\nClassic \+ Imanes ilimitados/);
  assert.match(draft.body, /DURACIÓN\n3 horas/);
  assert.doesNotMatch(draft.body, /Valor total/);
  assert.match(draft.body, /SALDO PENDIENTE\n\$345\.100/);
});

test("overdue collection template keeps the same canonical event block", () => {
  const draft = buildCollectionEmailDraft(
    invoice({ status: "OVERDUE", daysRemaining: -4 }),
    bankDetails,
  );
  assert.equal(draft.templateKey, "OVERDUE");
  assert.match(draft.body, /Te escribimos para recordarte el saldo pendiente de tu evento\./);
  assert.match(draft.body, /FECHA\n14 de septiembre de 2026/);
  assert.match(draft.body, /SALDO PENDIENTE\n\$345\.100/);
  assert.match(draft.body, /BANCO\nBCI/);
});

test("missing venue is omitted without placeholder or null leakage", () => {
  const draft = buildCollectionEmailDraft(
    invoice({ eventLocation: null }),
    bankDetails,
  );
  assert.doesNotMatch(draft.body, /^LUGAR$/m);
  assert.doesNotMatch(draft.body, /null|undefined/i);
});

test("separate receivables keep event and balance data isolated", () => {
  const first = buildCollectionEmailDraft(invoice(), bankDetails);
  const second = buildCollectionEmailDraft(
    invoice({
      invoiceNumber: "FAC-2026-900",
      customerName: "Otro Cliente",
      customerEmail: "otro@example.com",
      amount: 1_200_000,
      outstandingBalance: 800_000,
      eventDate: "2026-10-02",
      eventLocation: "Viña del Mar",
      service: "Glam",
      eventDuration: "4 horas",
    }),
    bankDetails,
  );
  assert.match(first.body, /Las Condes/);
  assert.doesNotMatch(first.body, /Viña del Mar|\$800\.000/);
  assert.match(second.body, /Viña del Mar|\$800\.000/);
  assert.doesNotMatch(second.body, /Las Condes|\$345\.100/);
});

test("draft fingerprint detects stale balances or event details before send", () => {
  const current = buildCollectionEmailDraft(invoice(), bankDetails);
  const changedBalance = buildCollectionEmailDraft(
    invoice({ outstandingBalance: 245_100 }),
    bankDetails,
  );
  const changedVenue = buildCollectionEmailDraft(
    invoice({ eventLocation: "Nuevo lugar" }),
    bankDetails,
  );
  assert.notEqual(
    collectionDraftFingerprint(current),
    collectionDraftFingerprint(changedBalance),
  );
  assert.notEqual(
    collectionDraftFingerprint(current),
    collectionDraftFingerprint(changedVenue),
  );
  assert.match(action, /expectedDraft !== collectionDraftFingerprint\(draft\)/);
});

test("send reloads one invoice with canonical event data immediately before provider call", () => {
  assert.match(action, /\.eq\("id", invoiceId\)/);
  assert.match(action, /outstanding_balance/);
  assert.match(action, /event_date,location,city,operations/);
  assert.match(action, /project_services\(service_code,duration_hours\)/);
  assert.match(action, /project_operational_contracts\(service_start_at,service_end_at\)/);
  assert.match(action, /resolveCollectionEventDetail/);
  assert.match(action, /GoogleGmailApiProvider/);
});

test("composer shows complete mobile-safe collection summary and preserves CC", () => {
  assert.match(composer, /data-collection-event-summary/);
  assert.match(composer, /Resumen canónico de la cobranza/);
  assert.match(composer, /Fecha del evento/);
  assert.match(composer, /draft\.eventLocation \?/);
  assert.match(composer, /Servicio/);
  assert.match(composer, /Duración/);
  assert.match(composer, /Saldo pendiente/);
  assert.match(composer, /label="Para"/);
  assert.match(composer, /label="CC"/);
  assert.match(composer, /variant="fullscreen-mobile"/);
  assert.match(composer, /min-w-0/);
  assert.match(composer, /break-words/);
});

test("communication history snapshots body while Payment Ledger remains read-only", () => {
  assert.match(action, /communication_type: "COLLECTION_EMAIL"/);
  assert.match(action, /subject,\s*body,\s*status: "PENDING"/);
  assert.match(action, /cc_recipients: recipients\.cc/);
  assert.doesNotMatch(action, /from\("invoice_payments"\)/);
  assert.doesNotMatch(action, /from\("payment_ledger"\)/i);
  assert.match(repository, /from\("invoice_payments"\)\.select/);
  assert.doesNotMatch(repository, /from\("invoice_payments"\)\.(insert|update|delete)/);
});

test("collection HTML matches Photo 3 hierarchy without duplicated canonical data", () => {
  const draft = buildCollectionEmailDraft(invoice(), bankDetails);
  const html = buildCollectionEmailHtml(draft);
  const intro = html.slice(html.indexOf("Hola Jenniffer"), html.indexOf("Detalle del evento"));

  assert.match(html, />BOOMBOX</);
  assert.match(html, />Cobranza comercial</);
  assert.equal(
    intro.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    "Hola Jenniffer Chavez, Te escribimos para recordarte el saldo pendiente de tu evento.",
  );
  assert.doesNotMatch(intro, /14 de septiembre|Las Condes|Classic|3 horas|\$345\.100|25 de septiembre|BCI|52093409/);
  for (const value of [
    "14 de septiembre de 2026",
    "Centro de Eventos Las Condes · Santiago",
    "Classic + Imanes ilimitados",
    "3 horas",
    "$345.100",
    "25 de septiembre de 2026",
    "BCI",
    "Cuenta Corriente",
    "52093409",
    "76.565.272-3",
  ]) assert.equal(html.split(value).length - 1, 1, `${value} must render exactly once`);
  assert.match(html, /Detalle del evento/);
  assert.match(html, /Saldo pendiente/);
  assert.match(html, /Datos para transferencia/);
  assert.match(html, /Una vez realizado el pago, envía el comprobante a/);
  assert.equal((html.match(/mailto:contabilidad@bbox\.cl/g) ?? []).length, 1);
  assert.match(html, /BOOMBOX · Comunicación emitida mediante ORBIT/);
  assert.match(html, /ORBIT · Software desarrollado por BOOMBOX/);
  assert.match(html, />www\.bbox\.cl</);
  assert.doesNotMatch(html, /Si el pago ya fue efectuado|Muchas gracias|responder este correo|Valor total/);
});

test("collection HTML is contained on desktop and wraps Photo 3 cells on mobile", () => {
  const html = buildCollectionEmailHtml(buildCollectionEmailDraft(invoice(), bankDetails));
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /max-width:620px/);
  assert.match(html, /width:49%;min-width:230px/);
  assert.match(html, /overflow-wrap:anywhere/);
});
