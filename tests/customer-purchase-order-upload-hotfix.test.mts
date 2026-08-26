import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CUSTOMER_PURCHASE_ORDER_MAX_BYTES,
  customerPurchaseOrderDriveFileName,
  operationalErrorMessage,
  validateCustomerPurchaseOrderFile,
} from "../features/commercial-documents/customer-purchase-order.model.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/0178_customer_purchase_order_upload_hotfix.sql");
const actions = source("features/commercial-documents/actions.ts");
const drive = source("features/commercial-documents/customer-purchase-order-drive.service.ts");
const center = source("features/commercial-documents/customer-purchase-order-center.tsx");
const eventPage = source("app/(platform)/projects/[projectId]/page.tsx");
const eventHub = source("features/external-tax-documents/event-commercial-document-hub.tsx");
const route = source("app/api/projects/[projectId]/documents/[documentId]/route.ts");

test("PDF OC upload is accepted", () => {
  assert.deepEqual(validateCustomerPurchaseOrderFile({ name: "OC 100.pdf", size: 1200, type: "application/pdf" }), { extension: "pdf", mimeType: "application/pdf" });
});

test("JPG and JPEG OC uploads are accepted", () => {
  assert.equal(validateCustomerPurchaseOrderFile({ name: "oc.jpg", size: 2, type: "image/jpeg" }).extension, "jpg");
  assert.equal(validateCustomerPurchaseOrderFile({ name: "oc.JPEG", size: 2, type: "image/jpeg" }).extension, "jpg");
});

test("PNG OC upload is accepted", () => {
  assert.equal(validateCustomerPurchaseOrderFile({ name: "oc.PNG", size: 2, type: "image/png" }).extension, "png");
});

test("invalid MIME or extension has a specific error", () => {
  assert.throws(() => validateCustomerPurchaseOrderFile({ name: "oc.xlsx", size: 2, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), /Formato no permitido/);
  assert.throws(() => validateCustomerPurchaseOrderFile({ name: "oc.txt", size: 2, type: "application/pdf" }), /Formato no permitido/);
});

test("oversized OC has a specific error", () => {
  assert.throws(() => validateCustomerPurchaseOrderFile({ name: "oc.pdf", size: CUSTOMER_PURCHASE_ORDER_MAX_BYTES + 1, type: "application/pdf" }), /Archivo demasiado grande/);
  assert.match(source("next.config.ts"), /bodySizeLimit: "21mb"/);
});

test("metadata persists the canonical OC model", () => {
  for (const field of ["p_document_id", "p_project_id", "p_file_size", "p_original_filename", "p_mime_type", "uploaded_by", "drive_sync_status", "workflow_status"])
    assert.match(migration, new RegExp(field));
  assert.match(migration, /'CUSTOMER_PURCHASE_ORDER','orbit-documents'/);
});

test("the OC is associated to the exact active Event and Customer", () => {
  assert.match(migration, /where id=p_project_id and deleted_at is null/);
  assert.match(migration, /project_row\.customer_id,project_row\.orbit_event_id/);
  assert.match(actions, /\.eq\("id", projectId\)\.is\("deleted_at", null\)/);
});

test("reload persistence is read from canonical documents", () => {
  assert.match(eventPage, /purchase_order_number/);
  assert.match(eventPage, /file_size/);
  assert.match(eventHub, /CUSTOMER_PURCHASE_ORDER/);
});

test("view and download remain protected and project scoped", () => {
  assert.match(route, /auth\.getUser/);
  assert.match(route, /\.eq\("project_id", projectId\)/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(center, /\?download=1/);
});

test("double click is synchronously blocked in the mobile composer", () => {
  assert.match(center, /uploadLock\.current/);
  assert.match(center, /if \(uploadLock\.current\) return/);
  assert.match(center, /disabled=\{pending\}/);
});

test("network retry reuses one canonical document and removes a race upload", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotency_key=p_idempotency_key/);
  assert.match(actions, /canonicalId !== documentId/);
  assert.match(actions, /remove\(\[storagePath\]\)/);
});

test("canonical success is independent from Drive failure", () => {
  assert.match(actions, /phase = "DRIVE_ARCHIVE"/);
  assert.match(actions, /archiveOrWarn/);
  assert.match(actions, /La OC quedó protegida en ORBIT/);
  assert.doesNotMatch(drive, /\.from\("documents"\)\.delete/);
});

test("Drive retry is Founder-only and document scoped", () => {
  assert.match(actions, /retryCustomerPurchaseOrderDriveAction/);
  assert.match(actions, /await founderSession\(\)/);
  assert.match(actions, /\.eq\("project_id", projectId\)/);
  assert.match(center, /REINTENTAR DRIVE/);
});

test("Drive archive is deterministic and idempotent", () => {
  assert.equal(customerPurchaseOrderDriveFileName({ documentId: "12345678-0000-0000-0000-000000000000", orbitEventId: "2026-826", originalFilename: "OC final.pdf" }), "OC_CLIENTE_2026-826_12345678_OC-final.pdf");
  assert.match(drive, /archiveReservationDocumentToDrive/);
  assert.match(source("features/connectors/google-drive/application/google-drive-document-routing.service.ts"), /findFileByName/);
});

test("failed metadata persistence cannot leave an orphan Storage object", () => {
  assert.match(actions, /phase = "METADATA_PERSISTENCE"/);
  assert.match(actions, /if \(storagePath\)/);
  assert.match(actions, /remove\(\[storagePath\]\)/);
});

test("one Event cannot have duplicate current OC metadata", () => {
  assert.match(source("supabase/migrations/0167_quote_reservation_commercial_event_file.sql"), /documents_current_customer_purchase_order_uq/);
  assert.match(migration, /perform pg_advisory_xact_lock/);
  assert.match(migration, /is_current=false/);
});

test("Commercial Documents renders received state and canonical actions", () => {
  assert.match(eventHub, /purchaseOrder\?"RECIBIDA"/);
  assert.match(center, /✓ RECIBIDA/);
  assert.match(center, /VER DOCUMENTO/);
  assert.match(center, /REEMPLAZAR \/ ACTUALIZAR/);
});

test("mobile upload uses the certified dialog and exact send states", () => {
  assert.match(center, /MobileDialog/);
  assert.match(center, /variant="fullscreen-mobile"/);
  assert.match(center, /SUBIENDO OC\.\.\./);
  assert.match(center, /✓ OC CLIENTE ADJUNTADA/);
  assert.match(center, /min-w-0 max-w-full/);
});

test("the root constraint defect is repaired without widening Timeline", () => {
  assert.match(migration, /actor,'Founder','Administrator','CUSTOMER_PURCHASE_ORDER_ATTACHED'/);
  assert.doesNotMatch(migration, /'Event Documents'/);
  assert.equal(operationalErrorMessage({ message: "23514 timeline_events_source_check" }, "fallback"), "23514 timeline_events_source_check");
  assert.match(actions, /customer_purchase_order\.upload\.failed/);
});

test("the hotfix does not touch frozen commercial or financial systems", () => {
  const combined = [migration, actions, drive, center].join("\n");
  assert.doesNotMatch(combined, /invoice_payments|receivable_movements|paid_amount|secondary_email|cc_recipients/);
  assert.doesNotMatch(migration, /update public\.projects|update public\.customers|delete from public\.customers/);
});
