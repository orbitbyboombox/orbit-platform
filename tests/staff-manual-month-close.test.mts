import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("features/staff-payments/actions.ts", "utf8");
const ui = readFileSync("features/staff-payments/staff-payments-center.tsx", "utf8");

test("manual month close validates the canonical audit before close_staff_month", () => {
  const start = actions.indexOf("export async function manualCloseStaffMonthAction");
  const end = actions.indexOf("export async function closeStaffMonthAction", start);
  const source = actions.slice(start, end);
  assert.match(source, /staff_month_financial_audit/);
  assert.match(source, /criticalErrorCount/);
  assert.match(source, /preview_staff_monthly_close/);
  assert.match(source, /close_staff_month/);
  assert.ok(source.indexOf("staff_month_financial_audit") < source.indexOf("close_staff_month"));
});

test("manual close is separate from the email-producing close action", () => {
  const start = actions.indexOf("export async function manualCloseStaffMonthAction");
  const end = actions.indexOf("export async function closeStaffMonthAction", start);
  const source = actions.slice(start, end);
  assert.doesNotMatch(source, /sendMonthlySettlementReadyEmail|requestIndividualStaffBoletaAction/);
  assert.match(ui, /CERRAR MES MANUALMENTE/);
  assert.match(ui, /No se enviarán correos ni se generarán pagos/);
});

test("manual close requires explicit confirmation and stays Founder/Admin guarded server-side", () => {
  assert.match(ui, /window\.confirm/);
  const start = actions.indexOf("export async function manualCloseStaffMonthAction");
  const end = actions.indexOf("export async function closeStaffMonthAction", start);
  assert.match(actions.slice(start, end), /context\(\)/);
});
