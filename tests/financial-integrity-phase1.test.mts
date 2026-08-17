import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/migrations/0140_financial_integrity_hotfix_phase1.sql`, "utf8");
const migration0141 = readFileSync(`${root}/supabase/migrations/0141_register_receivable_payment_rpc_overload_fix.sql`, "utf8");
const migration0142 = readFileSync(`${root}/supabase/migrations/0142_financial_ledger_integrity.sql`, "utf8");
const migration0144 = readFileSync(`${root}/supabase/migrations/0144_financial_resolution_helper_schema_fix.sql`, "utf8");
const migration0145 = readFileSync(`${root}/supabase/migrations/0145_backfill_maintenance_authorization.sql`, "utf8");
const reconciliation = readFileSync(`${root}/supabase/migrations/0100_rc31g_banking_reconciliation.sql`, "utf8");
const actions = readFileSync(`${root}/features/accounts-receivable/actions.ts`, "utf8");
const ui = readFileSync(`${root}/features/accounts-receivable/event-payment-manager.tsx`, "utf8");

test("compatibilidad de register_receivable_payment con firma legacy de 7 args", () => {
  assert.match(
    migration,
    /create or replace function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text\s*\)/,
  );
  assert.match(
    reconciliation,
    /payment:=public\.register_receivable_payment\(inv\.id,\s*item\.amount,coalesce\(item\.transfer_date,current_date\)::timestamptz,/,
  );
  assert.match(
    migration,
    /payment_id := public\.register_receivable_payment\([\s\S]*?p_receipt_checksum => null,\s*p_idempotency_key => null\s*\);/,
  );
  assert.match(
    migration0141,
    /revoke all on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text\) from public,anon;/,
  );
  assert.match(
    migration0141,
    /revoke all on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text,text,text\) from public,anon;/,
  );
  assert.equal(
    /create function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text\s*\)\s*returns uuid language plpgsql/.test(migration0141),
    false,
    "0141 no debe recrear la firma legacy de 7 args.",
  );
});

test("register_receivable_payment con 9 args es inequívoco para REST", () => {
  assert.match(
    migration0141,
    /create function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text,\s*p_receipt_checksum text,\s*p_idempotency_key text\s*\)/,
  );
  assert.equal(
    /p_receipt_checksum text default null/.test(migration0141),
    false,
    "La firma canónica no debe quedar con defaults en 0141.",
  );
  assert.equal(
    /p_idempotency_key text default null/.test(migration0141),
    false,
    "La firma canónica no debe quedar con defaults en 0141.",
  );
  assert.equal(
    /create function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text\s*\)/.test(
      migration0141,
    ),
    false,
    "0141 no debe redefinir la firma legacy de 7 args.",
  );
});

test("0141 reescribe explícitamente el 9-arg sin defaults y sin CREATE OR REPLACE", () => {
  const signatureWithoutDefaults = /create function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text,\s*p_receipt_checksum text,\s*p_idempotency_key text\s*\)/;
  assert.ok(signatureWithoutDefaults.test(migration0141), "Debe definir el 9-arg canónico sin CREATE OR REPLACE");
  assert.equal(
    /create or replace function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text,\s*p_receipt_checksum text,\s*p_idempotency_key text\s*\)/.test(migration0141),
    false,
    "No debe usar CREATE OR REPLACE en el 9-arg canónico.",
  );
  assert.match(
    migration0141,
    /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.register_receivable_payment\(\s*uuid,\s*numeric,\s*timestamptz,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text\s*\);/i,
  );
  assert.equal(/cascade/i.test(migration0141), false, "El DROP de 0141 no debe usar CASCADE.");
  assert.equal(
    /do\\s+\\$\\$/.test(migration0141),
    false,
    "0141 no debe usar DO block.",
  );
  assert.equal(
    /pg_get_function_identity_arguments/.test(migration0141),
    false,
    "0141 no debe usar pg_get_function_identity_arguments.",
  );
  assert.equal(
    /create function public\.register_receivable_payment\(\s*p_invoice_id uuid,\s*p_amount numeric,\s*p_paid_at timestamptz,\s*p_method text,\s*p_receipt_path text,\s*p_receipt_name text,\s*p_observation text\s*\)/.test(
      migration0141,
    ),
    false,
    "0141 no debe recrear la firma legacy de 7 args.",
  );
});

test("no se revocan/otorgan firmas inexistentes de register_receivable_payment en 0140", () => {
  assert.doesNotMatch(
    migration,
    /revoke all on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text,text\) from public,anon;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.register_receivable_payment\(uuid,numeric,timestamptz,text,text,text,text,text\) to authenticated;/,
  );
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

test("preview_receivable_payment_receipt_backfill no depende de columnas no existentes de storage.objects", () => {
  const snippetStart = migration.indexOf("create or replace function public.preview_receivable_payment_receipt_backfill()");
  const snippetEnd = migration.indexOf("create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)");
  assert.ok(snippetStart >= 0 && snippetEnd > snippetStart, "backfill preview function exists in 0140");

  const snippet = migration.slice(snippetStart, snippetEnd);
  assert.ok(snippet.includes("storage.objects"), "Debe consultar storage.objects");
  assert.equal(
    /left join storage\.objects o on o\.bucket_id = 'orbit-documents' and o\.name = ip\.receipt_path/.test(snippet),
    true,
    "Debe validar existencia por bucket_id + name",
  );
  assert.equal(/o\.deleted_at/.test(snippet), false, "No debe usar storage.objects.deleted_at");
  assert.match(snippet, /o\.name is not null as has_storage_object/);
});

test("preview_receivable_payment_receipt_backfill usa orbit_event_id real", () => {
  const snippetStart = migration.indexOf("create or replace function public.preview_receivable_payment_receipt_backfill()");
  const snippetEnd = migration.indexOf("create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)");
  assert.ok(snippetStart >= 0 && snippetEnd > snippetStart, "backfill preview function exists in 0140");

  const snippet = migration.slice(snippetStart, snippetEnd);
  assert.ok(snippet.includes("  orbit_event_id text,"), "Debe declarar orbit_event_id como text");
  assert.ok(snippet.includes("  payment_id uuid,"));
  assert.ok(snippet.includes("  invoice_id uuid,"));
  assert.ok(snippet.includes("  project_id uuid,"));
  assert.ok(snippet.includes("  customer_id uuid,"));
  assert.ok(snippet.includes("  receipt_path text,"));
  assert.ok(snippet.includes("  has_documents_row boolean,"));
  assert.ok(snippet.includes("  has_storage_object boolean,"));
  assert.ok(snippet.includes("  has_drive_file_id boolean,"));
  assert.ok(snippet.includes("  recommendation text"));
  assert.equal(/i\.orbit_event_id\s*::\s*uuid/.test(snippet), false, "No debe castear orbit_event_id legacy a UUID");
  assert.match(
    snippet,
    /select\s+ip\.id,\s*ip\.invoice_id,\s*i\.project_id,\s*i\.customer_id,\s*i\.orbit_event_id,\s*ip\.receipt_path,\s*d\.id is not null as has_documents_row,\s*o\.name is not null as has_storage_object,\s*d\.drive_file_id is not null as has_drive_file_id,\s*case\n\s+when d\.id is null then 'INSERT'/,
  );
});

test("revisar funciones returns table/record de 0140", () => {
  assert.match(
    migration,
    /create or replace function public\.preview_receivable_payment_receipt_backfill\(\)\s*returns table\(/,
  );
  assert.ok(migration.includes("create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)"));
  assert.ok(!/create or replace function public\.[^(]+\([^)]*\)\s*returns record/.test(migration));
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


test("0142 define el ledger canónico de cobrado sobre invoice_payments", () => {
  assert.match(
    migration0142,
    /create or replace function public\.recalculate_invoice_paid_amount\(p_invoice_id uuid\)[\s\S]*ip\.invoice_id = p_invoice_id[\s\S]*ip\.deleted_at is null/,
  );
  assert.ok(
    migration0142.includes("create or replace function public.invoice_payment_cash_impact("),
    "Debe existir la función invoice_payment_cash_impact",
  );
  assert.ok(
    migration0142.includes("when upper(coalesce(trim(p_movement_type), 'PARTIAL_PAYMENT')) in ("),
    "invoice_payment_cash_impact debe incluir movement types de abonos",
  );
  assert.ok(
    migration0142.includes("'DEPOSIT',"),
    "invoice_payment_cash_impact debe incluir DEPOSIT en los movement types",
  );
  assert.ok(
    migration0142.includes("'PARTIAL_PAYMENT',"),
    "invoice_payment_cash_impact debe incluir PARTIAL_PAYMENT en los movement types",
  );
  assert.ok(
    migration0142.includes("'FULL_PAYMENT'"),
    "invoice_payment_cash_impact debe incluir FULL_PAYMENT en los movement types",
  );
  assert.ok(
    migration0142.includes(") then coalesce(p_amount, 0)"),
    "invoice_payment_cash_impact debe devolver monto positivo en movement types de abono",
  );
  assert.ok(
    migration0142.includes(
      "when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_COMPLETED' then -abs(coalesce(p_amount, 0))",
    ),
    "invoice_payment_cash_impact debe descontar monto con RETURN_COMPLETED",
  );
  assert.ok(
    migration0142.includes("when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_PENDING' then 0"),
    "invoice_payment_cash_impact debe tratar RETURN_PENDING como no caja",
  );
  const recalcStart = migration0142.indexOf("create or replace function public.recalculate_invoice_paid_amount(p_invoice_id uuid)");
  const recalcEnd = migration0142.indexOf("create or replace function public.receivable_movement_cash_impact(");
  const recalcBlock = migration0142.slice(recalcStart, recalcEnd);
  assert.equal(
    /sum\(ip\.amount\)/.test(recalcBlock),
    false,
    "El cálculo canónico de paid_amount no debe sumar invoice_payments.amount directamente",
  );
});

test("0142 protege recibos técnicos en receivable_movements", () => {
  assert.match(migration0142, /create or replace function public\.receivable_movement_cash_impact\(/);
  assert.ok(
    migration0142.includes("upper(coalesce(p_metadata ->> 'managedAction', '')) in ('DELETE', 'CANCEL') then 0"),
    "Los movimientos con managedAction DELETE/CANCEL no deben impactar caja",
  );
  assert.ok(
    migration0142.includes("when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_PENDING' then 0"),
    "RETURN_PENDING debe ser técnico y no afectar caja",
  );
  assert.equal(
    /upper\(coalesce\(trim\(p_movement_type\), ''\)\) = 'RETURN_PENDING'[\s\S]*managedAction[\s\S]*RETURN_COMPLETED[\s\S]*-abs\(/.test(migration0142),
    false,
    "RETURN_PENDING con managedAction RETURN_COMPLETED no debe reducir caja en la capa de eventos",
  );
  assert.match(
    migration0142,
    /create or replace function public\.recalculate_receivable_movement_amount\(p_invoice_id uuid\)/,
  );
});

test("0145 permite ejecución del backfill desde service role o admin autenticado", () => {
  assert.equal(
    migration0145.includes("create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)"),
    true,
    "0145 debe reescribir la función canónica de backfill.",
  );
  assert.match(
    migration0145,
    /is_service_backend :=\s*coalesce\(current_setting\('request\.jwt\.claim\.role', true\), ''\)\s*=\s*'service_role'\s*or auth\.role\(\) = 'service_role'/,
  );
  assert.match(
    migration0145,
    /if not \(is_service_backend or \(actor is not null and public\.can_administer\(\)\)\) then/,
  );
});

test("0145 bloquea anon y autenticado no-admin", () => {
  assert.match(
    migration0145,
    /revoke all on function public\.execute_receivable_payment_receipt_backfill\(boolean\) from public,anon;/,
  );
  assert.match(
    migration0145,
    /if not \(is_service_backend or \(actor is not null and public\.can_administer\(\)\)\) then/,
  );
  assert.match(
    migration0145,
    /or auth\.role\(\) = 'service_role';/,
  );
});

test("0145 mantiene idempotencia de ejecución y dry-run", () => {
  assert.equal(
    /if not p_dry_run then[\s\S]*insert into public\.documents/.test(migration0145),
    true,
    "La inserción debe ocurrir solo en modo no dry-run.",
  );
  assert.equal(
    /if not p_dry_run then[\s\S]*update public\.documents/.test(migration0145),
    true,
    "El update debe ocurrir solo en modo no dry-run.",
  );
  assert.equal(
    migration0145.includes("on conflict (idempotency_key) do nothing"),
    true,
    "El backfill debe seguir siendo idempotente.",
  );
});

test("0145 no añade side effects de escritura al instalarse", () => {
  const migrationText = migration0145.toLowerCase();
  const bodyStart = migrationText.indexOf("create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)");
  const bodyEnd = migrationText.indexOf("revoke all on function public.execute_receivable_payment_receipt_backfill(boolean) from public,anon;");
  const functionBody = bodyStart >= 0 && bodyEnd > bodyStart ? migration0145.slice(bodyStart, bodyEnd) : "";
  assert.ok(functionBody.length > 0, "Debe existir el bloque de función en 0145.");
  assert.equal(functionBody.includes("return jsonb_build_object"), true, "La función debe retornar conteo de acciones.");
  assert.equal(functionBody.includes("if not p_dry_run then"), true, "Debe ejecutar cambios solo fuera de dry-run.");
  assert.equal(functionBody.includes("insert into public.documents"), true, "Solo permite inserciones por ejecución controlada.");
  assert.equal(functionBody.includes("update public.documents"), true, "Solo permite updates por ejecución controlada.");
  assert.equal(functionBody.includes("delete "), false, "0145 no debe incluir DELETE durante backfill.");
});

test("0144 elimina dependencia inexistente de invoice_payments.metadata", () => {
  assert.match(
    migration0144,
    /create or replace function public\.mark_return_pending_technical_resolution\(\s*p_movement_id uuid,\s*p_actor_id uuid,\s*p_resolution_reason text,\s*p_source_payment_id uuid,\s*p_applies_cash_impact boolean default false\s*\)/,
  );
  assert.equal(
    migration0144.includes("update public.invoice_payments"),
    false,
    "0144 no debe escribir metadata en invoice_payments (columna inexistente en production).",
  );
  assert.equal(
    /select rm\.invoice_id, rm\.reference[\s\S]*into v_invoice_id, v_reference/.test(migration0144),
    true,
    "Debe cargar factura y reference de receivable_movements para resolución técnica.",
  );
  assert.equal(
    migration0144.includes("if v_reference ~* '^[0-9a-fA-F-]{36}$'"),
    true,
    "Debe derivar el movimiento de pago cuando reference viene como UUID.",
  );
  assert.equal(
    migration0144.includes("set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object("),
    true,
    "Debe actualizar metadata técnica de receivable_movements.",
  );
});

test("0144 preserva resolución técnica y mantiene sourcePaymentId opcional en metadata", () => {
  assert.match(
    migration0144,
    /'sourcePaymentId', v_source_payment_id::text,/,
  );
  assert.match(
    migration0144,
    /'sourceMovementId', p_movement_id::text/,
  );
  assert.match(
    migration0144,
    /coalesce\(upper\(metadata -> 'technicalResolution' ->> 'status'\), ''\) <> 'RESOLVED_TECHNICAL'/,
  );
});

test("0142 preview de integridad detecta mismatches entre capas", () => {
  assert.match(
    migration0142,
    /create or replace function public\.preview_financial_ledger_integrity\(p_invoice_id uuid default null\)/,
  );
  assert.match(
    migration0142,
    /create or replace function public\.recalculate_receivable_movement_amount\(p_invoice_id uuid\)/,
  );
  assert.match(
    migration0142,
    /create or replace function public\.preview_invoice_repair_plan\(\n  p_invoice_ids uuid\[\] default null\n\)/,
  );
  assert.match(
    migration0142,
    /public\.recalculate_receivable_movement_amount\(i\.id\) <> public\.recalculate_invoice_paid_amount\(i\.id\)/,
  );
  assert.match(
    migration0142,
    /revoke all on function public\.financial_ledger_integrity_summary\(\) from public,anon;/,
  );
});
