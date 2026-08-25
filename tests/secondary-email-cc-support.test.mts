import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isValidOptionalEmail,
  normalizeCcRecipients,
  normalizeEmailRecipients,
  normalizeOptionalEmail,
  normalizeRequiredEmail,
} from "../lib/email/recipients.ts";
import { prepareFormalQuotePersistence } from "../features/commercial-hub/quote-persistence.ts";
import { buildCollectionEmailDraft } from "../features/accounts-receivable/collection-email.template.ts";
import { GoogleGmailApiProvider } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("1 reservation primary email normalization", () => {
  assert.equal(normalizeRequiredEmail(" CLIENTE@Empresa.CL "), "cliente@empresa.cl");
});

test("2 reservation supports an absent secondary email", () => {
  assert.equal(normalizeOptionalEmail("   "), null);
  assert.equal(isValidOptionalEmail(""), true);
});

test("3 reservation secondary email normalization", () => {
  assert.equal(normalizeOptionalEmail(" PRODUCCION@Empresa.CL "), "produccion@empresa.cl");
});

test("4 malformed secondary email is rejected", () => {
  assert.throws(() => normalizeOptionalEmail("correo-invalido"), /no es válido/);
  assert.equal(isValidOptionalEmail("correo-invalido"), false);
});

test("5 malformed CC is rejected server-side", () => {
  assert.throws(
    () => normalizeEmailRecipients({ to: "cliente@empresa.cl", cc: ["bad"] }),
    /correo CC no es válido/,
  );
});

test("6 multiple CC recipients are accepted", () => {
  assert.deepEqual(
    normalizeCcRecipients("uno@empresa.cl, dos@empresa.cl\ntres@empresa.cl", "cliente@empresa.cl"),
    ["uno@empresa.cl", "dos@empresa.cl", "tres@empresa.cl"],
  );
});

test("7 duplicate CC recipients are deduplicated case-insensitively", () => {
  assert.deepEqual(
    normalizeCcRecipients(["UNO@empresa.cl", "uno@empresa.cl"], "cliente@empresa.cl"),
    ["uno@empresa.cl"],
  );
});

test("8 primary address is never duplicated in CC", () => {
  assert.deepEqual(
    normalizeCcRecipients(["CLIENTE@EMPRESA.CL", "admin@empresa.cl"], "cliente@empresa.cl"),
    ["admin@empresa.cl"],
  );
});

test("9 whitespace-only CC entries are not sent", () => {
  assert.deepEqual(normalizeCcRecipients(" , ; \n ", "cliente@empresa.cl"), []);
});

test("10 quotation snapshot preserves permanent secondary email", () => {
  const persisted = prepareFormalQuotePersistence({
    existingCustomerId: "customer-1",
    saveTemporaryCustomer: false,
    company: "Empresa",
    rut: "",
    contact: "Cliente",
    email: "cliente@empresa.cl",
    secondaryEmail: "produccion@empresa.cl",
    phone: "",
    address: "",
    eventName: "Evento",
    eventDate: "",
    eventTime: "",
    eventLocation: "",
    eventCity: "",
    validityDays: 10,
    depositPercent: 50,
    globalDiscountType: null,
    globalDiscountValue: 0,
    attachCatalog: false,
    lines: [],
  });
  assert.equal(persisted.customerSnapshot.email, "cliente@empresa.cl");
  assert.equal(persisted.customerSnapshot.secondaryEmail, "produccion@empresa.cl");
});

test("11 collection composer suggests only canonical secondary email", () => {
  const draft = buildCollectionEmailDraft({
    invoiceNumber: "INV-1",
    customerName: "Cliente",
    customerEmail: "cliente@empresa.cl",
    customerSecondaryEmail: "finanzas@empresa.cl",
    projectName: "Evento",
    outstandingBalance: 1000,
    dueDate: "2026-08-25",
    daysRemaining: 0,
    status: "PENDING",
    collectionActions: [],
  }, { bankName: "BCI", accountType: "Cuenta Corriente", accountNumber: "1", rut: "1-9", email: "pagos@boom-box.cl", companyLabel: "BOOMBOX" });
  assert.deepEqual(draft.cc, ["finanzas@empresa.cl"]);
});

test("12 collection without secondary email keeps CC empty", () => {
  const draft = buildCollectionEmailDraft({
    invoiceNumber: "INV-2", customerName: "Cliente", customerEmail: "cliente@empresa.cl", customerSecondaryEmail: null, projectName: "Evento", outstandingBalance: 1000, dueDate: null, daysRemaining: null, status: "PENDING", collectionActions: [],
  }, { bankName: "BCI", accountType: "Cuenta Corriente", accountNumber: "1", rut: "1-9", email: "pagos@boom-box.cl", companyLabel: "BOOMBOX" });
  assert.deepEqual(draft.cc, []);
});

test("13 migration is additive and preserves existing rows", () => {
  const migration = source("supabase/migrations/0166_secondary_email_cc_support.sql");
  assert.match(migration, /add column if not exists secondary_email text/);
  assert.match(migration, /default '\{\}'::text\[\]/);
  assert.doesNotMatch(migration, /delete from public\.customers|truncate|update public\.customers/i);
});

test("14 shared reservation pipeline persists new-customer secondary email", () => {
  const migration = source("supabase/migrations/0166_secondary_email_cc_support.sql");
  assert.match(migration, /insert into customers\(id,full_name,email,secondary_email/);
  assert.match(migration, /d_customer->>'secondaryEmail'/);
});

test("15 reservation reload uses canonical secondary email", () => {
  const repository = source("features/projects/infrastructure/supabase-customer.repository.ts");
  assert.match(repository, /select\("full_name,email,secondary_email,phone,company,rut,address"\)/);
  assert.match(repository, /secondaryEmail: canonicalCustomer\.secondary_email/);
});

test("16 reservation event recipient snapshot is persisted", () => {
  const migration = source("supabase/migrations/0166_secondary_email_cc_support.sql");
  assert.match(migration, /communication_recipient_snapshot/);
  assert.match(migration, /jsonb_build_object\('to'/);
});

test("17 CRM customer profile supports safe secondary email editing", () => {
  assert.match(source("features/crm/customer-profile.tsx"), /Email secundario \/ CC \(opcional\)/);
  assert.match(source("features/crm/actions.ts"), /secondary_email: normalizeOptionalEmail/);
});

test("18 new reservation shows both email fields and helper", () => {
  const drawer = source("features/projects/components/new-project-drawer.tsx");
  assert.match(drawer, /label="Email principal"/);
  assert.match(drawer, /label="Email secundario \/ CC \(opcional\)"/);
  assert.match(drawer, /Recibirá copia de las comunicaciones asociadas a esta reserva/);
});

test("19 quote composer suggests secondary email while Founder controls CC", () => {
  const hub = source("features/commercial-hub/commercial-hub.tsx");
  assert.match(hub, /useState\(secondaryEmail\)/);
  assert.match(hub, /onChange=\{\(e\) => setCcInput\(e\.target\.value\)\}/);
});

test("20 temporary quotation CC is not written to permanent customer data", () => {
  const actions = source("features/commercial-hub/actions.ts");
  assert.match(actions, /cc_recipients: recipients\.cc/);
  assert.doesNotMatch(actions, /secondary_email:\s*recipients\.cc/);
});

test("21 Gmail provider emits one actual Cc header", () => {
  const provider = source("features/connectors/google-gmail/provider/google-gmail-live.provider.ts");
  assert.ok(provider.includes('`Cc: ${message.cc.join(", ")}`'));
  assert.match(provider, /messages\/send/);
});

test("22 communication history preserves TO CC time subject provider and relations", () => {
  const migration = source("supabase/migrations/0166_secondary_email_cc_support.sql");
  const repository = source("features/commercial-hub/repository.ts");
  assert.match(migration, /to_recipient text/);
  assert.match(migration, /cc_recipients text\[\]/);
  assert.match(repository, /external_message_id,quotation_id,project_id,customer_id/);
});

test("23 portal authentication and signing sends do not receive CC", () => {
  const delivery = source("features/connectors/google-gmail/application/google-gmail-delivery.service.ts");
  const signing = source("features/projects/signing/digital-signature.service.ts");
  assert.doesNotMatch(delivery, /cc:/);
  assert.doesNotMatch(signing, /cc:/);
});

test("24 mobile recipient fields cannot force horizontal overflow", () => {
  const quote = source("features/commercial-hub/commercial-hub.tsx");
  const collection = source("features/accounts-receivable/collection-email-composer.tsx");
  assert.match(quote, /min-w-0/);
  assert.match(collection, /w-full min-w-0/);
  assert.match(collection, /variant="fullscreen-mobile"/);
});

test("25 Gmail sends TO and CC in one canonical provider request", async () => {
  const originalFetch = globalThis.fetch;
  let raw = "";
  globalThis.fetch = async (_input, init) => {
    raw = String(JSON.parse(String(init?.body)).raw);
    return new Response(JSON.stringify({ id: "message-1", threadId: "thread-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await new GoogleGmailApiProvider("test-token").send({
      to: "cliente@empresa.cl",
      cc: ["produccion@empresa.cl", "admin@empresa.cl"],
      subject: "Cotización",
      textBody: "Cotización",
      htmlBody: "<p>Cotización</p>",
      driveFileIds: [],
    });
    const padded = raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const mime = Buffer.from(padded, "base64").toString("utf8");
    assert.equal(result.messageId, "message-1");
    assert.match(mime, /^To: cliente@empresa\.cl$/m);
    assert.match(mime, /^Cc: produccion@empresa\.cl, admin@empresa\.cl$/m);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
