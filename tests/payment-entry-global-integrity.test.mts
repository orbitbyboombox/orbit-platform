import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/accounts-receivable/actions.ts");
const ui = source("features/accounts-receivable/event-payment-manager.tsx");
const ledger = source("supabase/migrations/0142_financial_ledger_integrity.sql");
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
