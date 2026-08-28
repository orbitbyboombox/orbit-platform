import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCollectionEmailDraft,
  getLastCollectionNoticeAt,
} from "../features/accounts-receivable/collection-email.template.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const action = read("features/accounts-receivable/collection-email.actions.ts");
const composer = read("features/accounts-receivable/collection-email-composer.tsx");
const center = read("features/accounts-receivable/accounts-receivable-center.tsx");
const collectionCenter = read("features/accounts-receivable/collection-center.tsx");
const repository = read("features/accounts-receivable/repository.ts");
const portalService = read("features/customer-portal/customer-portal.service.ts");
const portalCommunicationCenter = read(
  "features/customer-portal/customer-communication-center.tsx",
);
const navigation = read("components/layout/navigation.ts");
const collectionPage = read("app/(platform)/finance/collections/page.tsx");
const receivablesPage = read("app/(platform)/finance/receivables/page.tsx");
const founderWorkspaceCatalog = read("features/founder-workspace/catalog.ts");
const founderWorkspaceRepository = read("features/founder-workspace/repository.ts");

const bankDetails = {
  companyLabel: "BOOMBOX",
  bankName: "BCI",
  accountType: "Cuenta Corriente",
  accountNumber: "52093409",
  rut: "76.565.272-3",
  email: "contabilidad@boombox.cl",
};

test("collection email draft distinguishes overdue and upcoming invoices", () => {
  const overdue = buildCollectionEmailDraft(
    {
      invoiceNumber: "FAC-2026-000001",
      customerName: "Sofía Mardones",
      customerEmail: "sofia@example.com",
      projectName: "ORB-2026-768712",
      outstandingBalance: 238000,
      dueDate: "2026-08-21",
      daysRemaining: -3,
      status: "OVERDUE",
      collectionActions: [
        { type: "PAYMENT_REMINDER", occurredAt: "2026-08-18T12:00:00-04:00" },
      ],
    } as unknown as Parameters<typeof buildCollectionEmailDraft>[0],
    bankDetails,
  );
  assert.equal(overdue.templateKey, "OVERDUE");
  assert.equal(overdue.to, "sofia@example.com");
  assert.equal(overdue.subject, "Saldo vencido pendiente de regularización — BOOMBOX");
  assert.match(overdue.body, /DETALLE DEL EVENTO/);
  assert.match(overdue.body, /BANCO\nBCI/);
  assert.match(overdue.body, /N° DE CUENTA\n52093409/);
  assert.match(overdue.body, /RUT\n76\.565\.272-3/);
  assert.match(overdue.body, /EMAIL DE TRANSFERENCIA\ncontabilidad@boombox\.cl/);
  assert.equal(overdue.lastNoticeLabel.includes("18"), true);
  assert.equal(overdue.lastNoticeLabel.includes("2026"), true);

  const upcoming = buildCollectionEmailDraft({
    invoiceNumber: "FAC-2026-000002",
    customerName: "Daniela Frías",
    customerEmail: "daniela@example.com",
    projectName: "Evento ORB",
    outstandingBalance: 580000,
    dueDate: "2026-08-30",
    daysRemaining: 6,
    status: "PENDING",
    collectionActions: [],
  } as unknown as Parameters<typeof buildCollectionEmailDraft>[0], bankDetails);
  assert.equal(upcoming.templateKey, "UPCOMING");
  assert.equal(upcoming.subject, "Recordatorio de saldo pendiente — BOOMBOX");
  assert.match(upcoming.body, /saldo pendiente/i);
  assert.match(upcoming.body, /BANCO\nBCI/);
  assert.equal(upcoming.lastNoticeLabel, "Sin avisos previos");
});

test("latest collection notice is derived from the most recent action list", () => {
  assert.equal(
    getLastCollectionNoticeAt([
      { type: "COLLECTION_EMAIL", occurredAt: "2026-08-20T08:00:00-04:00" },
      { type: "PAYMENT_REMINDER", occurredAt: "2026-08-24T08:00:00-04:00" },
    ]),
    "2026-08-20T08:00:00-04:00",
  );
});

test("collection email action is Founder-only, canonical and idempotent", () => {
  assert.match(action, /isAdministrativeRole/);
  assert.match(action, /Solo Founder o Administración puede enviar cobranzas/);
  assert.match(action, /loadCompanySettings/);
  assert.match(action, /resolveCollectionBankDetails/);
  assert.match(action, /buildCollectionEmailDraft\([\s\S]*bankDetails/);
  assert.match(action, /communication_type: "COLLECTION_EMAIL"/);
  assert.match(action, /thread_key: threadKey/);
  assert.match(action, /status: "PENDING"/);
  assert.match(action, /status: "SENT"/);
  assert.match(action, /deduplicated/);
  assert.match(action, /external_message_id/);
  assert.match(action, /sentAt/);
  assert.match(action, /providerMessageId/);
  assert.match(action, /timeline_events/);
  assert.match(action, /COLLECTION_EMAIL_SENT/);
  assert.match(action, /"\/finance\/receivables"/);
  assert.match(action, /"\/finance\/collections"/);
  assert.match(action, /`\/customers\/\$\{data\.customer_id\}`/);
});

test("receivables center exposes the collection composer and last notice label", () => {
  assert.match(center, /CollectionEmailComposer/);
  assert.match(center, /ENVIAR EMAIL/);
  assert.match(center, /REENVIAR COBRANZA/);
  assert.match(center, /Último aviso/);
  assert.match(center, /PAYMENT_REMINDER"\|\|item\.type==="COLLECTION_EMAIL"/);
});

test("collection center provides the founder operational workflow and bank details", () => {
  assert.match(collectionCenter, /Cobrar a Clientes/);
  assert.match(collectionCenter, /TODOS PENDIENTES/);
  assert.match(collectionCenter, /REENVIAR COBRANZA/);
  assert.match(collectionCenter, /CLIENTE SIN EMAIL/);
  assert.match(collectionCenter, /Historial de cobranza/);
  assert.match(collectionCenter, /Datos bancarios BOOMBOX/);
  assert.match(collectionCenter, /CollectionEmailComposer/);
  assert.match(collectionCenter, /bankDetails/);
});

test("navigation and finance pages expose the new collection center", () => {
  assert.match(navigation, /COBRAR CLIENTES/);
  assert.match(navigation, /\/finance\/collections/);
  assert.match(collectionPage, /resolveCollectionBankDetails/);
  assert.match(collectionPage, /CollectionCenter/);
  assert.match(receivablesPage, /resolveCollectionBankDetails/);
  assert.match(receivablesPage, /AccountsReceivableCenter/);
  assert.match(founderWorkspaceCatalog, /hiddenNavigation: \[\]/);
  assert.match(founderWorkspaceRepository, /newNavigation\.filter/);
  assert.match(founderWorkspaceRepository, /DEFAULT_WORKSPACE\.hiddenNavigation\.includes/);
});

test("repository, portal and communication center understand the new collection email type", () => {
  assert.match(repository, /COLLECTION_EMAIL/);
  assert.match(portalService, /COLLECTION_EMAIL_SENT/);
  assert.match(portalCommunicationCenter, /COLLECTION_EMAIL/);
  assert.match(portalCommunicationCenter, /Cobranza por email/);
  assert.match(portalCommunicationCenter, /key\.startsWith\("COLLECTION_"\)/);
});

test("composer uses the canonical mobile dialog and request id gate", () => {
  assert.match(composer, /MobileDialog/);
  assert.match(composer, /Último aviso/);
  assert.match(composer, /requestId/);
  assert.match(composer, /variant="fullscreen-mobile"/);
  assert.match(composer, /Datos bancarios BOOMBOX/);
  assert.match(composer, /dismissOnOverlayClick={false}/);
  assert.match(composer, /Enviando\.\.\./);
  assert.match(composer, /EMAIL ENVIADO/);
  assert.match(composer, /✓ Email enviado a/);
  assert.match(composer, /❌ No se pudo enviar el email/);
  assert.match(composer, /aria-live="polite"/);
});
