import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = read("features/accounts-receivable/actions.ts");
const ui = read("features/accounts-receivable/event-payment-manager.tsx");
const repository = read("features/crm/customer-operations.repository.ts");
const drive = read("features/connectors/google-drive/application/historical-payment-receipt-drive-sync.service.ts");
const migration = read("supabase/migrations/0188_payment_receipt_canonical_archive.sql");
const conflictFix = read("supabase/migrations/0189_payment_receipt_upsert_constraint_alignment.sql");

test("document-only retry attaches to an existing payment without financial writes", () => {
  assert.match(migration, /attach_receivable_payment_receipt/);
  assert.match(migration, /from public\.invoice_payments[\s\S]*id=p_payment_id/);
  assert.match(migration, /update public\.invoice_payments[\s\S]*receipt_path=/);
  assert.doesNotMatch(migration, /insert into public\.invoice_payments/);
  assert.doesNotMatch(migration, /insert into public\.receivable_movements/);
  assert.doesNotMatch(migration, /sync_invoice_financial_state|paid_amount\s*=|balance\s*=/);
});

test("canonical receipt metadata links payment invoice Event and customer", () => {
  for (const field of ["invoice_id", "payment_id", "project_id", "customer_id", "orbit_event_id", "storage_path", "original_filename", "mime_type", "file_size", "uploaded_by"])
    assert.match(migration, new RegExp(field));
  assert.match(migration, /document_type[\s\S]*'PAYMENT_RECEIPT'/);
  assert.match(migration, /storage_bucket[\s\S]*'orbit-documents'/);
  assert.match(migration, /payment_receipt_current\|/);
});

test("receipt upload is protected, validated and deterministic", () => {
  assert.match(actions, /allowedReceiptTypes/);
  assert.match(actions, /maxReceiptBytes = 15 \* 1024 \* 1024/);
  assert.match(actions, /payment-receipt-attach:\$\{invoiceId\}\|\$\{paymentId\}\|\$\{receipt\.checksum\}/);
  assert.match(actions, /canonicalReceiptStoragePath\(invoiceId, receiptKey, receipt\.extension\)/);
  assert.match(actions, /storage\.from\("orbit-documents"\)/);
  assert.doesNotMatch(actions, /getPublicUrl/);
});

test("all payment receipt entry points invoke the shared Drive archive helper", () => {
  for (const fn of ["applyReceivableMovementAction", "registerReceivablePaymentAction", "manageReceivablePaymentAction", "attachReceivablePaymentReceiptAction"])
    assert.match(actions.slice(actions.indexOf(`export async function ${fn}`)), /archivePaymentReceipt\(/);
  assert.match(actions, /executeHistoricalPaymentReceiptDriveSync/);
  assert.match(drive, /kind: "PAYMENT_PROOF"/);
  assert.match(drive, /setDriveFileId\(candidate\.documentId, uploaded\.id, destination\.folderId\)/);
});

test("Drive failure is persisted and never invalidates the payment", () => {
  assert.match(drive, /drive_sync_status: "ERROR"/);
  assert.match(drive, /drive_sync_error: reason\.slice/);
  assert.match(actions, /Comprobante guardado en ORBIT; sincronización con Drive pendiente/);
  assert.match(actions, /return "PENDING"/);
  assert.doesNotMatch(actions.slice(actions.indexOf("async function archivePaymentReceipt"), actions.indexOf("function receiptSuccessMessage")), /throw error/);
});

test("Drive archive is idempotent and targets the canonical receipt folder", () => {
  assert.match(drive, /findFileByName/);
  assert.match(drive, /RECONCILED_EXISTING/);
  assert.match(drive, /drive_folder_id/);
  const folders = read("features/connectors/google-drive/application/google-drive-folder-strategy.ts");
  assert.match(folders, /PAYMENT_PROOF: "02_Comprobantes"/);
});

test("Event reload exposes receipt name date visibility and Drive state", () => {
  assert.match(repository, /payment_id,document_type,storage_path,drive_file_id,drive_sync_status,drive_sync_error/);
  assert.match(repository, /receiptUploadedAt/);
  assert.match(repository, /receiptDriveStatus/);
  assert.match(ui, /VER COMPROBANTE/);
  assert.match(ui, /ADJUNTAR COMPROBANTE/);
  assert.match(ui, /Reintentar archivo en Drive/);
});

test("document-only action is global and contains no production identity exceptions", () => {
  const start = actions.indexOf("export async function attachReceivablePaymentReceiptAction");
  const end = actions.indexOf("export async function retryReceivablePaymentReceiptDriveAction", start);
  const flow = `${actions.slice(start, end)}\n${migration}`;
  assert.doesNotMatch(flow, /F[0-9A-F]{7}|ORB-20\d{2}/i);
  assert.doesNotMatch(flow, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("UI prevents double submit and explains that payment totals stay unchanged", () => {
  assert.match(ui, /disabled=\{pending\}/);
  assert.match(ui, /No se creará otro pago ni se modificarán el monto recibido o el saldo/);
  assert.match(ui, /Guardando y archivando…/);
});

test("receipt upserts infer the canonical partial idempotency constraint", () => {
  assert.match(conflictFix, /on conflict \(idempotency_key\) where idempotency_key is not null and deleted_at is null do update/i);
  assert.match(conflictFix, /documents_idempotency_uq/);
  for (const writer of [
    "apply_receivable_movement",
    "manage_receivable_payment",
    "attach_receivable_payment_receipt",
  ]) assert.match(conflictFix, new RegExp(writer));
});

test("one active receipt per payment is globally enforced after a duplicate preflight", () => {
  assert.match(conflictFix, /group by payment_id[\s\S]*having count\(\*\) > 1/);
  assert.match(conflictFix, /raise exception 'Duplicate active payment receipt documents exist/);
  assert.match(conflictFix, /create unique index if not exists documents_active_payment_receipt_uq/);
  assert.match(conflictFix, /on public\.documents \(payment_id\)[\s\S]*document_type = 'PAYMENT_RECEIPT'[\s\S]*deleted_at is null/);
});

test("constraint repair is document-only and has no production identity branches", () => {
  assert.doesNotMatch(conflictFix, /insert into public\.(invoice_payments|receivable_movements)|update public\.invoices|paid_amount\s*=|balance\s*=/i);
  assert.doesNotMatch(conflictFix, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.doesNotMatch(conflictFix, /F[0-9A-F]{7}|ORB-20\d{2}/i);
});
