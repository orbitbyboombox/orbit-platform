import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = read("features/automatic-booking/complete-automatic-booking.service.ts");
const migration = read("supabase/migrations/0197_automatic_booking_payment_ledger_reconciliation.sql");

test("automatic booking uses the global canonical ledger bridge", () => {
  assert.match(service, /rpc\("register_automatic_booking_deposit"/);
  assert.match(migration, /public\.apply_receivable_movement\(/);
});

test("the receipt document is persisted before the payment is registered", () => {
  assert.ok(service.indexOf('.from("documents").insert') < service.indexOf('rpc("register_automatic_booking_deposit"'));
});

test("Drive archival starts only after the canonical payment", () => {
  assert.ok(service.indexOf('rpc("register_automatic_booking_deposit"') < service.indexOf("uploadReservationDocumentToDrive({ client: admin, projectId"));
});

test("Drive failure preserves financial truth and surfaces a retry alert", () => {
  assert.match(service, /catch \(driveError\)/);
  assert.match(service, /AUTOMATIC_BOOKING_RECEIPT_DRIVE_FAILED/);
  assert.match(service, /El abono quedó registrado correctamente/);
});

test("the canonical receipt metadata is persisted", () => {
  for (const field of ["original_filename", "mime_type", "file_size", "uploaded_by", "drive_sync_status", "drive_synced_at"])
    assert.match(service, new RegExp(field));
});

test("the automatic amount comes from the accepted canonical quotation", () => {
  assert.match(migration, /quote\.final_customer_price,quote\.grand_total/);
  assert.match(migration, /quote\.deposit_percent,50/);
});

test("customer payload cannot choose the ledger amount", () => {
  assert.doesNotMatch(service, /p_amount/);
});

test("only automatic Events can use the bridge", () => {
  assert.match(migration, /reservationMethod',''\)\) <> 'AUTOMATIC'/);
});

test("only the service role can execute the bridge", () => {
  assert.match(migration, /auth\.role\(\).*service_role/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /from public,anon,authenticated/);
});

test("the canonical engine receives the verified internal actor transaction-locally", () => {
  assert.match(migration, /set_config\('request\.jwt\.claim\.sub',p_actor_id::text,true\)/);
  assert.match(migration, /set_config\([\s\S]*request\.jwt\.claims[\s\S]*'authenticated'/);
});

test("the Event owning actor is verified", () => {
  assert.match(migration, /p_actor_id is distinct from coalesce\(project\.updated_by,project\.created_by\)/);
});

test("the bridge only accepts an active production receivable", () => {
  assert.match(migration, /financial_record_state='ACTIVE'/);
  assert.match(migration, /record_origin='PRODUCTION'/);
});

test("the existing receipt must belong to the same Event and customer", () => {
  assert.match(migration, /id=p_receipt_document_id/);
  assert.match(migration, /project_id=project\.id/);
  assert.match(migration, /customer_id=project\.customer_id/);
});

test("the existing receipt is linked instead of duplicated", () => {
  assert.match(migration, /update public\.documents/);
  assert.doesNotMatch(migration, /insert into public\.documents/);
});

test("the document links to invoice and payment", () => {
  assert.match(migration, /invoice_id=invoice\.id/);
  assert.match(migration, /payment_id=v_payment_id/);
});

test("the payment movement carries the receipt path", () => {
  assert.match(migration, /update public\.invoice_payments[\s\S]*receipt_path=receipt\.storage_path/);
});

test("automatic deposit has a stable global idempotency key", () => {
  assert.match(migration, /'automatic-booking-deposit\|'\|\|project\.id::text/);
});

test("automatic receipt has a stable global idempotency key", () => {
  assert.match(migration, /'automatic-booking-receipt\|'\|\|project\.id::text/);
});

test("retry resolves the prior payment before creating anything", () => {
  assert.match(migration, /select id into v_existing_payment_id[\s\S]*idempotency_key=stable_key/);
});

test("ambiguous pre-existing payments stop automatic reconciliation", () => {
  assert.match(migration, /existing_payment_id is null and ledger_paid<>0/);
  assert.match(migration, /se requiere revisión/);
});

test("the canonical engine owns payment and balance calculations", () => {
  assert.doesNotMatch(migration, /insert into public\.invoice_payments/);
  assert.doesNotMatch(migration, /update public\.invoices\s+set paid_amount/);
});

test("ledger failure prevents signature and success continuation", () => {
  assert.ok(service.indexOf('if (paymentError) throw paymentError') < service.indexOf('currentModule = "SIGNATURE"'));
});

test("provider communication happens after canonical payment", () => {
  assert.ok(service.indexOf('rpc("register_automatic_booking_deposit"') < service.indexOf("confirmPersistedReservation({"));
});

test("manual Payment Ledger entry points are untouched", () => {
  assert.doesNotMatch(service, /register_receivable_payment|manage_receivable_payment/);
});

test("the bridge supports both configured payment methods", () => {
  assert.match(service, /p_method: input\.submission\.payment\.method/);
});

test("payment receipt storage remains protected", () => {
  assert.match(service, /storage_bucket: "orbit-documents"/);
  assert.doesNotMatch(service, /getPublicUrl|publicUrl/);
});

test("customer, Event and invoice hard-coded exceptions are absent", () => {
  assert.doesNotMatch(service + migration, /p_project_id\s*=\s*'[0-9a-f-]{36}'/i);
  assert.doesNotMatch(service + migration, /customer_id\s*=\s*'[0-9a-f-]{36}'/i);
  assert.doesNotMatch(service + migration, /full_name\s*=|customer_name\s*=/i);
});

test("the shared reservation pipeline remains the only post-confirmation orchestrator", () => {
  assert.equal((service.match(/confirmPersistedReservation\(/g) ?? []).length, 1);
});
