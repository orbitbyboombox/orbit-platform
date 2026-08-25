import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  acceptedCommercialFinancialPresentation,
  customerCommercialPresentation,
} from "../features/projects/reservation-presentation.ts";
import { shiftEventScheduleDate } from "../features/crm/event-schedule.ts";
import {
  buildCollectionEmailDraft,
  buildCollectionEmailHtml,
} from "../features/accounts-receivable/collection-email.template.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const eventAction = read("features/crm/actions.ts");
const eventCenter = read("features/crm/event-center.tsx");
const eventRepository = read("features/crm/events-repository.ts");
const migration = read("supabase/migrations/0173_event_date_atomic_update.sql");
const manualPdf = read("features/projects/signing/manual-reservation-formalization.service.ts");
const signedPdf = read("features/projects/signing/digital-signature.service.ts");
const pdf = read("features/projects/signing/signed-agreement-pdf.ts");
const navigation = read("components/layout/navigation.ts");
const workspace = read("features/founder-workspace/catalog.ts");
const sendAction = read("features/accounts-receivable/collection-email.actions.ts");
const composer = read("features/accounts-receivable/collection-email-composer.tsx");

const bank = {
  companyLabel: "BOOMBOX",
  bankName: "BCI",
  accountType: "Cuenta Corriente",
  accountNumber: "52093409",
  rut: "76.565.272-3",
  email: "contabilidad@boom-box.cl",
};

const collectionDraft = () =>
  buildCollectionEmailDraft(
    {
      invoiceNumber: "2026-826",
      customerName: "Jenniffer Chavez",
      customerEmail: "jfchave@ccu.cl",
      customerSecondaryEmail: "produccion@ccu.cl",
      projectName: "Evento corporativo",
      amount: 345_100,
      outstandingBalance: 172_550,
      dueDate: "2026-09-07",
      eventDate: "2026-09-15",
      eventLocation: "Patio de la Sala de Arte · Las Condes",
      service: "Classic",
      eventDuration: "3 horas",
      daysRemaining: 13,
      status: "PENDING",
      collectionActions: [],
    },
    bank,
  );

test("event date edit preserves local schedule offsets", () => {
  assert.equal(
    shiftEventScheduleDate("2026-09-14T14:00", "2026-09-14", "2026-09-15"),
    "2026-09-15T14:00",
  );
  assert.equal(
    shiftEventScheduleDate("2026-09-15T01:00", "2026-09-14", "2026-09-16"),
    "2026-09-17T01:00",
  );
});

test("event date and operational schedule commit through one atomic RPC", () => {
  assert.match(eventAction, /serviceStartLocal/);
  assert.match(eventAction, /serviceEndLocal/);
  assert.match(eventAction, /staffCallLocal/);
  assert.equal((eventAction.match(/update_crm_event_from_customer_profile/g) ?? []).length, 1);
  assert.doesNotMatch(eventAction, /\.rpc\("update_event_service_schedule"/);
  assert.match(migration, /perform public\.update_event_service_schedule/);
  assert.match(migration, /perform public\.update_crm_event/);
});

test("event save has explicit success, refresh persistence, and downstream sync", () => {
  assert.match(eventAction, /✓ Evento actualizado correctamente/);
  assert.match(eventCenter, /router\.refresh\(\)/);
  assert.match(eventCenter, /const events = initialEvents/);
  assert.doesNotMatch(eventCenter, /useState\(initialEvents\)/);
  assert.match(eventAction, /synchronizeConfirmedReservationCalendar/);
  assert.match(eventAction, /synchronizeConfirmedReservationDrive/);
  assert.match(eventAction, /"\/operations"/);
  assert.match(eventAction, /"\/finance\/collections"/);
  assert.match(eventRepository, /event\.event_date/);
});

test("accepted snapshot fixes company net, VAT, total, and actual deposit percent", () => {
  const financial = acceptedCommercialFinancialPresentation({
    commercial: {
      subtotal: 290_000,
      net: 290_000,
      tax: 55_100,
      total: 345_100,
      depositPercent: 58,
    },
  });
  assert.deepEqual(financial, {
    net: 290_000,
    vat: 55_100,
    total: 345_100,
    depositPercent: 58,
    deposit: 200_158,
    balance: 144_942,
  });
  assert.match(pdf, /Neto/);
  assert.match(pdf, /IVA 19%/);
  assert.match(pdf, /PRECIO TOTAL/);
  assert.match(pdf, /La reserva se confirma con un abono del \$\{depositPercent\}%/);
  assert.doesNotMatch(pdf, /Reserva 50%|SALDO RESTANTE/);
  for (const service of [manualPdf, signedPdf]) {
    assert.match(service, /acceptedCommercialFinancialPresentation/);
    assert.match(service, /accepted_snapshot/);
  }
});

test("customer-facing labels and duration remain commercial and canonical", () => {
  const presentation = customerCommercialPresentation({
    serviceCodes: ["CLASSIC", "UNLIMITED_MAGNETS"],
    commercialItems: [
      { code: "CLASSIC", itemType: "SERVICE" },
      { code: "UNLIMITED_MAGNETS", itemType: "EXTRA", total: 0 },
    ],
    serviceStartAt: "2026-09-15T14:00:00-04:00",
    serviceEndAt: "2026-09-15T17:00:00-04:00",
    serviceDurations: [3, 3],
  });
  assert.equal(presentation.service, "Classic");
  assert.equal(presentation.extrasLabel, "Imanes ilimitados · Gratis");
  assert.equal(presentation.duration, "3 horas");
});

test("COBRAR CLIENTES is the direct second Founder navigation destination", () => {
  const home = navigation.indexOf('key: "HOME"');
  const collections = navigation.indexOf('key: "COLLECTIONS"');
  const customers = navigation.indexOf('key: "CUSTOMERS"');
  assert.ok(home >= 0 && collections > home && customers > collections);
  assert.match(navigation, /label: "COBRAR CLIENTES"/);
  assert.match(navigation, /href: "\/finance\/collections"/);
  assert.match(workspace, /navigationOrder:\s*\[\s*"HOME",\s*"COLLECTIONS"/);
  assert.match(workspace, /hiddenNavigation:\s*\[\]/);
});

test("collection email is branded, complete, accessible, and mobile safe", () => {
  const draft = collectionDraft();
  const html = buildCollectionEmailHtml(draft);
  for (const value of [
    "BOOMBOX",
    "Detalle del evento",
    "15 de septiembre de 2026",
    "Patio de la Sala de Arte · Las Condes",
    "Classic",
    "3 horas",
    "$172.550",
    "7 de septiembre de 2026",
    "Datos para transferencia",
    "52093409",
  ]) assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Saldo pendiente/);
  assert.match(html, /max-width:620px/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.equal((html.match(/N° de cuenta/g) ?? []).length, 1);
  assert.doesNotMatch(html, /UNLIMITED_MAGNETS|3 horas \+ 3 horas/);
  assert.match(composer, /MobileDialog/);
  assert.match(composer, /CollectionEmailVisualPreview/);
  assert.match(composer, /break-words/);
});

test("provider success cannot become a false send error", () => {
  const provider = sendAction.indexOf("let sent;");
  const sentAt = sendAction.indexOf("const sentAt", provider);
  const afterProvider = sendAction.slice(sentAt);
  assert.ok(provider >= 0 && sentAt > provider);
  assert.doesNotMatch(afterProvider, /status: "FAILED"/);
  assert.match(afterProvider, /El proveedor confirmó el envío/);
  assert.match(afterProvider, /Timeline quedó pendiente/);
  assert.match(afterProvider, /la vista requiere recarga manual/);
  assert.match(afterProvider, /ok: true/);
  assert.match(composer, /✓ Email enviado a/);
});

test("collection retries remain idempotent and never touch payment truth", () => {
  assert.match(sendAction, /existing\.status === "SENT"/);
  assert.match(sendAction, /deduplicated: true/);
  assert.match(sendAction, /existing\.status === "PENDING"/);
  assert.match(sendAction, /thread_key: threadKey/);
  assert.match(sendAction, /expectedDraft/);
  assert.doesNotMatch(sendAction, /from\("invoice_payments"\)|paid_amount\s*:|outstanding_balance\s*:/);
  assert.doesNotMatch(migration, /invoice_payments|paid_amount|accepted_snapshot\s*=/);
});
