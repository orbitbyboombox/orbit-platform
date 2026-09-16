import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMonthlySettlementReadyEmail,
  buildStaffPaymentCompletedEmail,
} from "../features/staff-communications/staff-email.templates.ts";

const read = (path: string) => readFileSync(path, "utf8");
const monthlyService = read(
  "features/staff-monthly-account/monthly-communication.service.ts",
);
const monthlyActions = read("features/staff-monthly-account/actions.ts");
const closeActions = read("features/staff-payments/actions.ts");
const paymentCenter = read("features/staff-payments/staff-payments-center.tsx");
const closeMigration = read(
  "supabase/migrations/20260916123837_staff_monthly_distribution_close.sql",
);
const dashboard = read(
  "features/founder-workspace/founder-workspace-experience.tsx",
);
const actionCenter = read("features/founder-action-center/index.ts");
const visibility = read("features/founder-action-center/visibility.ts");
const receivables = read(
  "features/accounts-receivable/accounts-receivable-center.tsx",
);
const settlementPdf = read("features/staff-monthly-account/settlement-pdf.ts");

test("monthly settlement email is premium and contains the exact company boleta data", () => {
  const email = buildMonthlySettlementReadyEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "Sebastián",
    monthLabel: "septiembre de 2026",
    boletaGross: 100000,
    finalTransfer: 70000,
  });
  for (const expected of [
    "Tu liquidación mensual BOOMBOX está lista.",
    "PRODUCCIONES BOOMBOX COMPANY SPA",
    "76.565.272-3",
    "Giro: Publicidad",
    "PUERTA ORIENTE 361 OF 310 TORRE C",
    "Colina",
    "contabilidad@bbox.cl",
    "EVENTOS BOOMBOX",
    "Subir boleta en ORBIT",
  ])
    assert.match(
      email.htmlBody + email.textBody,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
});

test("payment completed email is branded and independent from the settlement request", () => {
  const email = buildStaffPaymentCompletedEmail({
    appUrl: "https://orbit.boom-box.cl",
    firstName: "José",
    monthLabel: "septiembre de 2026",
    amount: 34000,
    paidOn: "2026-09-16",
  });
  assert.match(email.subject, /PAGO REALIZADO/);
  assert.match(
    email.htmlBody,
    /Muchas gracias por ser parte de nuestra empresa/,
  );
  assert.match(email.htmlBody, /Ver comprobante en ORBIT/);
});

test("month close finalizes all accounts before attachment delivery and canonical close", () => {
  const finalize = closeActions.indexOf("finalize_staff_monthly_account");
  const deliver = closeActions.lastIndexOf("sendMonthlySettlementReadyEmail");
  const close = closeActions.lastIndexOf("close_staff_month");
  assert.ok(finalize > 0 && deliver > finalize && close > deliver);
  assert.match(closeActions, /prepareMonthlySettlementDocument/);
  assert.match(monthlyService, /attachments:\s*\[/);
  assert.match(monthlyService, /staff-monthly-settlement-ready:/);
  assert.match(monthlyService, /ignoreDuplicates:\s*true/);
  assert.match(monthlyService, /FAILED_REQUIRES_RECONCILIATION/);
});

test("canonical monthly close freezes finalized accounts and only advances to PAID after payments", () => {
  assert.match(closeMigration, /settlement_status<>'FINALIZED'/);
  assert.match(closeMigration, /review_required or work_net<=0/);
  assert.match(closeMigration, /status='CLOSED'/);
  assert.match(closeMigration, /payment_status<>'PAID'/);
  assert.match(closeMigration, /status='PAID'/);
  assert.match(closeMigration, /security definer/);
  assert.match(closeMigration, /set search_path=''/);
});

test("monthly payment refreshes the month and sends the exactly-once payment email", () => {
  assert.match(monthlyActions, /refresh_staff_month_payment_state/);
  assert.match(monthlyActions, /sendMonthlyPaymentCompletedEmail/);
  assert.match(monthlyService, /staff-monthly-payment-completed:/);
  assert.match(paymentCenter, /loadingLabel="Registrando y notificando…"/);
});

test("admin payroll sheet exposes every requested canonical column", () => {
  for (const label of [
    "Nombre",
    "Apellido",
    "Mes",
    "Total generado",
    "Adelantos",
    "Reembolsos",
    "Total liquidación",
    "Valor con boleta",
    "Valor a depositar",
    "Estado boleta",
    "Estado pago",
  ])
    assert.match(paymentCenter, new RegExp(label));
  assert.match(paymentCenter, /account\.finalTransferAmount/);
  assert.match(paymentCenter, /account\.advancesTotal/);
  assert.match(settlementPdf, /detail\.event\|\|detail\.service/);
});

test("monthly close loaders are scoped to the action that is actually running", () => {
  assert.match(paymentCenter, /closeOperation === "GENERATE"/);
  assert.match(paymentCenter, /closeOperation === "CLOSE"/);
  assert.match(paymentCenter, /closeOperation === "REOPEN"/);
  assert.doesNotMatch(paymentCenter, /loading=\{closing\}/);
});

test("Founder dashboard uses one accordion and exact review links", () => {
  assert.match(dashboard, /<details[\s\S]*Pendientes por revisar/);
  assert.doesNotMatch(dashboard, /compactSummary/);
  assert.match(actionCenter, /\/finance\/receivables\?invoice=/);
  assert.match(visibility, /reviewExpense=/);
  assert.match(visibility, /reviewAccount=/);
  assert.match(visibility, /#operations/);
  assert.match(receivables, /initialInvoiceId/);
  assert.match(receivables, /scrollIntoView/);
});
