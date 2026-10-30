import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20261030190000_staff_complementary_settlements.sql", "utf8");
const actions = readFileSync("features/staff-complementary-settlements/actions.ts", "utf8");
const panel = readFileSync("features/staff-complementary-settlements/staff-complementary-settlements-panel.tsx", "utf8");
const page = readFileSync("app/(platform)/resources/staff/page.tsx", "utf8");
const portalAction = readFileSync("features/portal-authentication/staff-portal.actions.ts", "utf8");
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const portalPanel = readFileSync("features/portal-authentication/staff-complementary-boleta-panel.tsx", "utf8");

test("net amount is base plus scalar adjustments and supports base-only events", () => {
  assert.match(sql, /coalesce\(v_event\.total_internal_payment,0\)/);
  assert.match(sql, /select sum\(a\.amount\) from public\.event_staff_settlement_adjustments/);
  assert.doesNotMatch(sql, /select v_event\.total_internal_payment\+coalesce\(sum\(a\.amount\),0\) into v_net/);
  assert.doesNotMatch(sql, /a\.deleted_at/);
});

test("complementary settlement is independent from monthly close", () => {
  assert.match(sql, /staff_monthly_accounts/);
  assert.match(sql, /settlement_status<>'FINALIZED'/);
  assert.doesNotMatch(sql, /update public\.staff_monthly_accounts/);
  assert.doesNotMatch(sql, /insert into public\.event_staff_settlement_movements/);
  assert.match(sql, /original_month/);
  assert.match(sql, /event_date/);
});

test("one active complementary settlement per event and payment idempotency are database enforced", () => {
  assert.match(sql, /staff_complementary_one_active_per_event/);
  assert.match(sql, /where status <> 'CANCELLED'/);
  assert.match(sql, /payment_idempotency_key text unique/);
  assert.match(sql, /for update/);
});

test("boleta lifecycle requires issue date and approval before payment", () => {
  assert.match(sql, /submit_staff_complementary_boleta/);
  assert.match(sql, /boleta_issue_date/);
  assert.match(sql, /status='BOLETA_RECEIVED'/);
  assert.match(sql, /READY_TO_PAY/);
  assert.match(sql, /item\.status<>'READY_TO_PAY'/);
});

test("payment requires exact frozen amount and a receipt", () => {
  assert.match(sql, /p_amount,0\)<>item\.net_amount/);
  assert.match(sql, /payment_receipt_document_id is not null/);
  assert.match(actions, /El monto no coincide con la liquidación congelada/);
  assert.match(panel, /Comprobante/);
});

test("the Finance Staff UI exposes independent complementary history and controls", () => {
  assert.match(page, /staff_complementary_settlements/);
  assert.match(page, /complementaryCandidates/);
  assert.match(panel, /Liquidaciones complementarias/);
  assert.match(panel, /Crear complementaria/);
  assert.match(panel, /Aprobar boleta/);
  assert.match(panel, /Registrar pago/);
});

test("the feature does not import the rejected month-transfer implementation", () => {
  assert.doesNotMatch(actions, /next-month|traspas|staff-advance-next-month/i);
  assert.doesNotMatch(sql, /next_month|carry_forward|transfer_month/i);
});

test("Staff upload is scoped to the signed-in operator and never registers payment", () => {
  assert.match(portalAction, /loadPortalSession\("STAFF"\)/);
  assert.match(portalAction, /eq\("staff_id", session\.staff_id\)/);
  assert.match(portalAction, /submit_staff_complementary_boleta_for_staff/);
  assert.doesNotMatch(portalAction, /register_staff_complementary_payment/);
  assert.match(portalPanel, /BOLETA_REJECTED/);
  assert.match(portalPanel, /type="file"/);
});

test("Staff portal reads only the operator's complementary settlements and stays compatible before migration", () => {
  assert.match(portal, /from\("staff_complementary_settlements"\)/);
  assert.match(portal, /eq\("staff_id",staffId\)/);
  assert.match(portal, /missingComplementarySettlementRelation/);
  assert.match(portal, /complementarySettlements/);
});

test("boleta submission creates an idempotent Drive path and admin notification", () => {
  assert.match(portalAction, /04_LIQUIDACIONES_COMPLEMENTARIAS/);
  assert.match(portalAction, /upsert: false/);
  assert.match(sql, /STAFF_COMPLEMENTARY_BOLETA/);
  assert.match(sql, /staff-complementary-boleta:/);
  assert.match(sql, /on conflict\(correlation_id\)/);
});
