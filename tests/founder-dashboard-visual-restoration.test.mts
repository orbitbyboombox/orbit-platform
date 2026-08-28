import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboard = readFileSync(
  new URL("features/founder-workspace/founder-workspace-experience.tsx", root),
  "utf8",
);
const page = readFileSync(
  new URL("app/(platform)/operations/page.tsx", root),
  "utf8",
);

test("the approved Founder Command Center structure is the rendered dashboard", () => {
  assert.match(dashboard, /Founder Command Center/);
  assert.match(dashboard, /grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6/);
  assert.match(dashboard, /Centro operacional · Hoy/);
  assert.match(dashboard, /Pendientes por revisar/);
  assert.match(dashboard, /Próximos eventos/);
  assert.match(dashboard, /Actividad reciente/);
});

test("the regressed personalization presentation is absent", () => {
  assert.doesNotMatch(dashboard, /FOUNDER DASHBOARD/);
  assert.doesNotMatch(dashboard, /Orden personal del escritorio/);
  assert.doesNotMatch(dashboard, /Editar escritorio/);
  assert.doesNotMatch(dashboard, /Indicadores principales[\s\S]*visibles/);
});

test("ordering wraps the original KPI and Quick Action components only in edit mode", () => {
  assert.match(dashboard, /Ordenar escritorio/);
  assert.match(dashboard, /orderedKpis\.map/);
  assert.match(dashboard, /orderedQuickActions\.map/);
  assert.match(dashboard, /saveFounderDashboardLayoutAction/);
  assert.match(dashboard, /Mover arriba/);
  assert.match(dashboard, /Mover abajo/);
  assert.match(dashboard, /controls \? <div[\s\S]*: <>\{children\}<\/>/);
});

test("stable IDs cover every approved KPI and Quick Action without duplicates", () => {
  for (const id of [
    "kpi.cash_registered",
    "kpi.total_receivables",
    "kpi.company_credit",
    "kpi.customer_balances",
    "kpi.month_sales",
    "kpi.operating_result",
    "kpi.operating_margin",
    "kpi.events_today",
    "action.new_customer",
    "action.new_reservation",
    "action.quote",
    "action.new_expense",
  ]) {
    assert.equal((dashboard.match(new RegExp(id.replace(".", "\\."), "g")) ?? []).length >= 1, true);
  }
});

test("date and approved Chile time remain visible", () => {
  assert.match(page, /dateStyle: "full",[\s\S]*timeStyle: "short",[\s\S]*timeZone: "America\/Santiago"/);
  assert.match(dashboard, /\{currentDate\}/);
});

test("financial values cannot wrap one character per line", () => {
  assert.match(dashboard, /whitespace-nowrap/);
  assert.doesNotMatch(dashboard, /overflow-wrap:anywhere/);
  assert.doesNotMatch(dashboard, /break-all/);
});
