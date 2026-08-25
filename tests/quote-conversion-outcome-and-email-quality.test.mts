import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalEventDuration,
  commercialServiceLabel,
  commercialServiceList,
  currentCustomerContact,
} from "../features/projects/reservation-presentation.ts";
import { renderFounderReservationNotification } from "../features/connectors/google-gmail/application/reservation-notification.presentation.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/commercial-hub/actions.ts");
const conversionUi = source("features/commercial-hub/quote-conversion-review.tsx");
const delivery = source(
  "features/connectors/google-gmail/application/google-gmail-delivery.service.ts",
);
const migration = source(
  "supabase/migrations/0168_quote_conversion_committed_outcome_recovery.sql",
);

const rendered = renderFounderReservationNotification({
  projectId: "project-1",
  projectUrl: "https://orbit.boom-box.cl/projects/project-1",
  orbitEventId: "event-1",
  quotationNumber: "2026-826",
  customer: {
    fullName: "Alejandra Lainez",
    metadata: {
      primaryContact: { firstName: "Jenniffer", lastName: "Chavez" },
    },
  },
  serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
  serviceDurations: [3, 3],
  serviceStartAt: "2026-09-14T17:00:00.000Z",
  serviceEndAt: "2026-09-14T20:00:00.000Z",
  eventDurationHours: 3,
  eventDate: "2026-09-14",
  amount: 345_100,
  paymentStatus: "Pendiente",
  customerType: "Empresa",
  contractStatus: "PENDING",
  integrations: [{ label: "Google Drive", ready: true }],
});

test("1 service catalog code renders its commercial label", () => {
  assert.equal(commercialServiceLabel("CLASSIC"), "Classic");
});

test("2 extra code renders its commercial label", () => {
  assert.equal(commercialServiceLabel("UNLIMITED_MAGNETS"), "Imanes ilimitados");
});

test("3 service list never exposes internal codes", () => {
  const value = commercialServiceList(["CLASSIC", "UNLIMITED_MAGNETS"]);
  assert.equal(value, "Classic + Imanes ilimitados");
  assert.doesNotMatch(value, /UNLIMITED_MAGNETS/);
});

test("4 simultaneous services use maximum duration instead of sum", () => {
  assert.equal(canonicalEventDuration({ serviceDurations: [3, 3] }), "3 horas");
});

test("5 an operational schedule is the canonical sequential duration", () => {
  assert.equal(
    canonicalEventDuration({
      serviceStartAt: "2026-09-14T17:00:00.000Z",
      serviceEndAt: "2026-09-14T21:30:00.000Z",
      eventDurationHours: 3,
      serviceDurations: [3, 3],
    }),
    "4,5 horas",
  );
});

test("6 event duration outranks duplicated service durations", () => {
  assert.equal(
    canonicalEventDuration({ eventDurationHours: 3, serviceDurations: [2, 4] }),
    "3 horas",
  );
});

test("7 singular duration uses hora", () => {
  assert.equal(canonicalEventDuration({ eventDurationHours: 1 }), "1 hora");
});

test("8 unknown internal codes are humanized", () => {
  assert.equal(commercialServiceLabel("NEW_SERVICE_CODE"), "New Service Code");
});

test("9 current CRM primary contact wins over a stale display name", () => {
  assert.equal(
    currentCustomerContact({
      fullName: "Alejandra Lainez",
      metadata: { primaryContact: { firstName: "Jenniffer", lastName: "Chavez" } },
    }),
    "Jenniffer Chavez",
  );
});

test("10 current CRM full name is the fallback contact", () => {
  assert.equal(currentCustomerContact({ fullName: "Jenniffer Chavez" }), "Jenniffer Chavez");
});

test("11 Founder email renders corrected duration", () => {
  assert.match(rendered.textBody, /Duración: 3 horas/);
  assert.doesNotMatch(rendered.textBody, /3 h \+ 3 h/);
});

test("12 Founder email renders commercial service labels", () => {
  assert.match(rendered.textBody, /Servicio: Classic \+ Imanes ilimitados/);
  assert.doesNotMatch(rendered.textBody, /UNLIMITED_MAGNETS/);
});

test("13 normal pending contract is a business status, not a warning", () => {
  assert.equal(rendered.contract, "Pendiente");
  assert.match(rendered.textBody, /Contrato: Pendiente/);
  assert.doesNotMatch(rendered.textBody, /PENDIENTE · Contract|⚠️ Contrato/);
});

test("14 Founder email uses the latest CRM contact", () => {
  assert.match(rendered.textBody, /Cliente: Jenniffer Chavez/);
  assert.doesNotMatch(rendered.textBody, /Cliente: Alejandra Lainez/);
});

test("15 confirmed customer communication also resolves current CRM data", () => {
  assert.match(delivery, /customers!inner\(full_name,email,phone,metadata\)/);
  assert.match(delivery, /currentCustomerContact/);
});

test("16 committed reservation success has the exact user outcome", () => {
  assert.match(actions, /message: "✓ Reserva creada correctamente"/);
});

test("17 post-commit integration failures become structured warnings", () => {
  assert.match(actions, /commercial_quote\.post_commit_integration_pending/);
  assert.match(actions, /conversionWarning\(warnings, "Vinculación comercial"/);
});

test("18 browser exception performs committed-project recovery", () => {
  assert.match(conversionUi, /recoverCommercialQuoteConversionAction/);
  assert.match(actions, /recoverCommittedQuoteConversion/);
});

test("19 success remains visible with direct Event navigation", () => {
  assert.match(conversionUi, /ABRIR EVENTO/);
  assert.match(conversionUi, /href=\{`\/projects\/\$\{outcome\.projectId\}`\}/);
});

test("20 pending integrations are named without invalidating the reservation", () => {
  assert.match(
    conversionUi,
    /Hay una integración pendiente de sincronización: \{warning\.integration\}\./,
  );
});

test("21 omitted OC performs no upload and cannot fail conversion", () => {
  assert.match(actions, /ocFile instanceof File && ocFile\.size/);
  assert.match(actions, /conversionWarning\(warnings, "OC Cliente"/);
});

test("22 one quote and one project remain unique through recovery", () => {
  const original = source(
    "supabase/migrations/0167_quote_reservation_commercial_event_file.sql",
  );
  assert.match(original, /quotation_id uuid not null unique/);
  assert.match(original, /project_id uuid not null unique/);
  assert.match(migration, /on conflict \(quotation_id\) do nothing/);
});

test("23 recovery requires the completed canonical reservation transaction", () => {
  assert.match(migration, /tx\.status = 'COMPLETED'/);
  assert.match(migration, /tx\.project_id = q\.project_id/);
});

test("24 recovery preserves the immutable accepted snapshot", () => {
  assert.match(migration, /q\.accepted_snapshot/);
  assert.doesNotMatch(migration, /set\s+accepted_snapshot|accepted_snapshot\s*=/i);
});

test("25 recovery never recreates or deletes Customer or Event records", () => {
  assert.doesNotMatch(migration, /insert into public\.(customers|projects)/i);
  assert.doesNotMatch(migration, /delete from|truncate/i);
});

test("26 reservation email duplicate protection remains in force", () => {
  assert.match(delivery, /existing\?\.status === "SENT"/);
  assert.match(delivery, /founder-reservation:\$\{input\.projectId\}/);
});

test("27 payment ledger is outside the fix", () => {
  assert.doesNotMatch(migration, /invoice_payments|receivable_movements|paid_amount/);
  assert.doesNotMatch(actions, /invoice_payments|receivable_movements|paid_amount/);
});

test("28 customer email and CC delivery rules are unchanged", () => {
  assert.doesNotMatch(delivery, /\bcc:/);
  assert.doesNotMatch(migration, /secondary_email|cc_recipients|communications/);
});
