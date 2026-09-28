import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260928170000_staff_flexible_boleta_payment.sql", "utf8");
const panel = readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx", "utf8");

test("payment RPC is independent from boleta approval", () => {
  const paymentBody = migration.slice(migration.indexOf("create or replace function public.register_staff_monthly_payment"), migration.indexOf("create or replace function public.review_staff_monthly_boleta"));
  assert.doesNotMatch(paymentBody, /item\.boleta_status\s*<>'APPROVED'/);
  assert.match(paymentBody, /item\.settlement_status\s*<>'FINALIZED'/);
  assert.match(paymentBody, /STAFF_PAYMENT_RECEIPT/);
});

test("boleta approval preserves an already paid account", () => {
  assert.match(migration, /p_action='APPROVE' and payment_status='PAID' then 'PAID'/);
});

test("UI exposes independent pay and boleta upload paths", () => {
  assert.match(panel, /PAGAR ·/);
  assert.match(panel, /account\.boletaStatus !== "APPROVED"/);
  assert.match(panel, /PAGADO · BOLETA PENDIENTE/);
  assert.match(panel, /BOLETA APROBADA · PAGO PENDIENTE/);
});
