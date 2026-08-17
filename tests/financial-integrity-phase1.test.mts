import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/migrations/0140_financial_integrity_hotfix_phase1.sql`, "utf8");
const reconciliation = readFileSync(`${root}/supabase/migrations/0100_rc31g_banking_reconciliation.sql`, "utf8");
const actions = readFileSync(`${root}/features/accounts-receivable/actions.ts`, "utf8");
const ui = readFileSync(`${root}/features/accounts-receivable/event-payment-manager.tsx`, "utf8");

test("compatibilidad de register_receivable_payment con firma legacy de 7 args", () => {
  assert.match(
    migration,
    /create or replace function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text\s*\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text,\s*p_receipt_checksum text default null,\s*p_idempotency_key text default null\s*\)/,
  );
  assert.match(
    reconciliation,
    /payment:=public\.register_receivable_payment\(inv\.id,\s*item\.amount,coalesce\(item\.transfer_date,current_date\)::timestamptz,/,
  );
  assert.match(
    migration,
    /payment_id := public\.register_receivable_payment\([\s\S]*?p_receipt_checksum => null,\s*p_idempotency_key => null\s*\);/,
  );
  assert.match(migration, /revoke all on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text\) from public,anon;/);
  assert.match(migration, /revoke all on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text,text,text\) from public,anon;/);
});

test("idempotencia estable sin timestamp y con requestId", () => {
  assert.match(actions, /const stableRequestId = \(parts\.requestId \?\? ""\)\.trim\(\);/);
  const helperStart = actions.indexOf("function buildPaymentIdempotencyKey");
  const helperEnd = actions.indexOf("async function detectReceipt");
  const helperBlock = actions.slice(helperStart, helperEnd);
  assert.ok(helperBlock);
  assert.equal(helperBlock.includes("occurredOn"), false);
  assert.equal(helperBlock.includes("phase1-request:"), true);
  assert.match(ui, /data\.set\("requestId", actionRequestId\);/);
  assert.match(ui, /data\.set\("requestId", requestId\);/);
});

test("dos pagos legítimos idénticos permiten requestId distinto", () => {
  assert.match(actions, /requestId/);
  assert.match(actions, /phase1-request:\$\{parts\.invoiceId\}\|/);
  assert.match(actions, /requestId,/);
});

test("RETURN_PENDING con guías de estado y monto aplicable", () => {
  assert.match(
    migration,
    /elsif action = 'RETURN_PENDING' then[\s\S]*if current_paid <= 0 then[\s\S]*raise exception 'La cuenta ya se encuentra pendiente\.';/,
  );
  assert.match(
    migration,
    /if inv\.status not in \('PENDING', 'PARTIALLY_PAID', 'PAID'\) and inv\.status <> 'DRAFT' then/,
  );
  assert.match(migration, /effective := -current_paid;/);
});

test("checksum real y fallback operativo no ambiguo", () => {
  assert.match(migration, /p_receipt_checksum text default null/);
  assert.match(migration, /coalesce\(\s*normalized_checksum,\s*'OPERATIONAL-FINGERPRINT:v1\|'/);
  assert.match(migration, /'OPERATIONAL-FINGERPRINT:v1\|backfill\|'/);
  assert.equal(migration.includes("normalized_checksum"), true);
  assert.equal(migration.includes("md5(inv.id::text"), false);
  assert.equal(migration.includes("md5("), false);
});

test("backfill de comprobantes preparado DRY-RUN/idempotente", () => {
  assert.match(migration, /create or replace function public\.preview_receivable_payment_receipt_backfill\(\)/);
  assert.match(
    migration,
    /create or replace function public\.execute_receivable_payment_receipt_backfill\(p_dry_run boolean default true\)/,
  );
  assert.match(migration, /'INSERT'/);
  assert.match(migration, /'UPDATE'/);
  assert.match(migration, /'NONE'/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /if not p_dry_run then[\s\S]*on conflict \(idempotency_key\) do nothing;/);
  assert.match(migration, /update public\.documents[\s\S]*where storage_path = item\.receipt_path/);
  assert.match(migration, /return jsonb_build_object\(\s*'total_scanned'/);
});

test("migration no rompe callers legacy ni SQL principales", () => {
  assert.match(
    migration,
    /grant execute on function public\.apply_receivable_movement\(uuid,text,numeric,timestamptz,text,text,text,text,text\) to authenticated;/,
  );
  assert.match(
    migration,
    /revoke all on function public\.apply_receivable_movement\(uuid,text,numeric,timestamptz,text,text,text,text,text\) from public,anon;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.sync_project_commercial_state\(uuid\) to authenticated,service_role;/,
  );
  assert.match(migration, /recalculate_invoice_paid_amount\(p_invoice_id uuid\)/);
});
