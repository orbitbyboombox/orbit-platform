import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/accounts-receivable/actions.ts");
const ui = source("features/accounts-receivable/event-payment-manager.tsx");
const ledger = source("supabase/migrations/0142_financial_ledger_integrity.sql");
const receiptSchemaHotfix = source("supabase/migrations/0184_payment_receipt_documents_schema_hotfix.sql");
const confirmation = source("features/connectors/google-gmail/application/reservation-confirmation.service.ts");
const manualStart = actions.indexOf("export async function registerReceivablePaymentAction");
const manualEnd = actions.indexOf("export async function confirmReconciledPaymentAction", manualStart);
const manual = actions.slice(manualStart, manualEnd);

test("manual payment uses the one canonical receivable movement pipeline", () => {
  assert.match(manual, /client\.rpc\("apply_receivable_movement"/);
  assert.doesNotMatch(manual, /client\.rpc\("register_receivable_payment"/);
});

test("manual payment scope is global and never branches on a customer identity", () => {
  assert.doesNotMatch(manual, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(manual, /full_name|company|customer_id|customerType|customer_type/);
});

test("invoice and Event ownership are verified before creating a movement", () => {
  assert.match(manual, /from\("accounts_receivable_projection"\)/);
  assert.match(manual, /\.eq\("id", invoiceId\)[\s\S]*\.eq\("project_id", projectId\)/);
});

test("exact outstanding amount is recorded as full payment and lower amount as partial", () => {
  assert.match(manual, /amount === outstanding \? "FULL_PAYMENT" : "PARTIAL_PAYMENT"/);
  assert.match(manual, /if \(amount > outstanding\)/);
});

test("manual payment remains idempotent across double click and network retry", () => {
  assert.match(manual, /requestId/);
  assert.match(manual, /buildPaymentIdempotencyKey/);
  assert.match(manual, /ensureNoDuplicatePaymentByIdempotency/);
  assert.match(ui, /disabled=\{pending\}/);
});

test("receipt validation is global and restricted to certified file types", () => {
  assert.match(actions, /const allowedReceiptTypes = new Set/);
  for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"])
    assert.match(actions, new RegExp(mime.replace("/", "\\/")));
  assert.match(actions, /maxReceiptBytes = 15 \* 1024 \* 1024/);
});

test("receipt persistence matches the canonical documents schema", () => {
  assert.match(receiptSchemaHotfix, /apply_receivable_movement\(uuid,text,numeric,timestamptz,text,text,text,text,text\)/);
  assert.match(receiptSchemaHotfix, /public\.documents canonically has created_by\/created_at/);
  assert.doesNotMatch(receiptSchemaHotfix, /alter table public\.documents[\s\S]*add column/);
  assert.match(receiptSchemaHotfix, /created_by,[\\n\s]+updated_by,[\\n\s]+idempotency_key/);
  assert.match(receiptSchemaHotfix, /checksum = coalesce\(documents\.checksum, excluded\.checksum\)/);
});

test("canonical payment transaction still links receipt and stays idempotent", () => {
  const migration = source("supabase/migrations/0140_financial_integrity_hotfix_phase1.sql");
  const fnStart = migration.indexOf("create or replace function public.apply_receivable_movement");
  const fnEnd = migration.indexOf("revoke all on function public.apply_receivable_movement", fnStart);
  const fn = migration.slice(fnStart, fnEnd);
  assert.match(fn, /insert into public\.invoice_payments/);
  assert.match(fn, /insert into public\.documents/);
  assert.match(fn, /payment_id,/);
  assert.match(fn, /on conflict \(idempotency_key\) do update/);
  assert.match(fn, /perform public\.sync_invoice_financial_state/);
  assert.doesNotMatch(fn, /created_by,\s*updated_by,\s*idempotency_key/);
  assert.doesNotMatch(fn, /checksum = coalesce\(documents\.checksum, excluded\.checksum\),\s*updated_at/);
});

test("a secondary receipt-name failure cannot turn a committed payment into a false failure", () => {
  const rpc = manual.indexOf('client.rpc("apply_receivable_movement"');
  const receiptName = manual.indexOf('event: "payment.receipt_name_sync_failed"');
  assert.ok(rpc >= 0 && receiptName > rpc);
  assert.match(manual, /console\.warn/);
  assert.doesNotMatch(manual.slice(receiptName), /throw receiptNameError/);
});

test("payment failures are observable with a support reference", () => {
  assert.match(actions, /event: "payment.entry.failed"/);
  assert.match(actions, /Referencia \$\{reference\}/);
  for (const operation of ["REGISTER_MANUAL_PAYMENT", "APPLY_RECEIVABLE_MOVEMENT", "MANAGE_PAYMENT_MOVEMENT", "CONFIRM_BANK_RECONCILIATION"])
    assert.match(actions, new RegExp(operation));
});

test("payment failure stays visible inside the MobileDialog and submission is locked", () => {
  assert.match(ui, /aria-live="assertive"/);
  assert.match(ui, /if \(pending\) return/);
  assert.match(ui, /pending \? "Registrando…"/);
});

test("ledger truth remains independent movements and recalculated from active entries", () => {
  assert.match(ledger, /from public\.invoice_payments ip/);
  assert.match(ledger, /ip\.deleted_at is null/);
  assert.match(ledger, /sum\(public\.invoice_payment_cash_impact/);
});

test("reservation confirmation Timeline uses the current Event identity globally", () => {
  assert.match(confirmation, /id,customer_id,orbit_event_id,name/);
  assert.match(confirmation, /orbitEventId: project\.orbit_event_id/);
  assert.match(confirmation, /from\("timeline_events"\)\.insert\(\{[\s\S]*orbit_event_id: composer\.orbitEventId/);
});

test("payment entry never sends a customer communication", () => {
  assert.doesNotMatch(manual, /Gmail|send\(|communications|RESERVATION_CONFIRMATION/);
});
