import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OVERDUE_INVOICE_GROUP_HREF,
  overdueGroupDetail,
  summarizeOverdueReceivables,
} from "../features/founder-action-center/overdue-group.ts";

const repository = readFileSync("features/founder-action-center/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/0190_group_overdue_founder_action.sql", "utf8");
const dashboard = readFileSync("features/founder-workspace/founder-workspace-experience.tsx", "utf8");
const collectionPage = readFileSync("app/(platform)/finance/collections/page.tsx", "utf8");
const collectionCenter = readFileSync("features/accounts-receivable/collection-center.tsx", "utf8");
const notificationRepository = readFileSync("features/notification-center/repository.ts", "utf8");

const today = "2026-08-27";

test("zero overdue receivables produces no financial group", () => {
  assert.deepEqual(summarizeOverdueReceivables([], today), { count: 0, total: 0, oldestDueDate: null });
  assert.match(repository, /if \(Number\(overdue\.count\) > 0\)/);
});

test("one overdue receivable produces one grouped action", () => {
  const result = summarizeOverdueReceivables([{ due_date: "2026-08-26", outstanding_balance: 1000, effective_status: "PENDING" }], today);
  assert.deepEqual(result, { count: 1, total: 1000, oldestDueDate: "2026-08-26" });
  assert.equal(overdueGroupDetail(result), "1 pendiente · $1.000 por cobrar");
});

test("many overdue receivables still produce one stable card", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ due_date: `2026-08-${String(index + 1).padStart(2, "0")}`, outstanding_balance: 1000, effective_status: "PARTIALLY_PAID" }));
  assert.equal(summarizeOverdueReceivables(rows, today).count, 10);
  assert.match(repository, /OVERDUE_INVOICE_GROUP_ID/);
  assert.equal((repository.match(/items\.push\(/g) ?? []).length, 1);
});

test("partial balances use canonical outstanding balance", () => {
  const result = summarizeOverdueReceivables([{ due_date: "2026-08-01", outstanding_balance: "456408", effective_status: "PARTIALLY_PAID" }], today);
  assert.equal(result.total, 456408);
});

test("fully paid and cancelled invoices are excluded", () => {
  const result = summarizeOverdueReceivables([
    { due_date: "2026-08-01", outstanding_balance: 0, effective_status: "PAID" },
    { due_date: "2026-08-01", outstanding_balance: 2000, effective_status: "CANCELLED" },
  ], today);
  assert.equal(result.count, 0);
});

test("invoice due today is not overdue in Chile", () => {
  assert.equal(summarizeOverdueReceivables([{ due_date: today, outstanding_balance: 1000, effective_status: "PENDING" }], today).count, 0);
  assert.match(migration, /due_date<timezone\('America\/Santiago',now\(\)\)::date/);
});

test("completed Events with active debt are not excluded", () => {
  const summaryFunction = migration.slice(0, migration.indexOf("create or replace function public.reconcile_founder_action_alerts"));
  assert.doesNotMatch(summaryFunction, /project.*status|event.*status/i);
  assert.equal(summarizeOverdueReceivables([{ due_date: "2026-08-01", outstanding_balance: 1000, effective_status: "OVERDUE" }], today).count, 1);
});

test("individual overdue notifications are resolved and never recreated", () => {
  assert.match(migration, /set status='RESOLVED',action_required=false/);
  assert.doesNotMatch(migration, /insert into public\.internal_notifications/);
  assert.doesNotMatch(migration, /founder-action:invoice:/);
});

test("legacy reminder refresh is projection-only", () => {
  assert.match(migration, /create or replace function public\.refresh_receivable_notifications/);
  assert.match(migration, /return 0/);
  assert.doesNotMatch(migration, /update public\.invoices/);
});

test("group action opens Cobrar Clientes filtered to VENCIDOS", () => {
  assert.equal(OVERDUE_INVOICE_GROUP_HREF, "/finance/collections?filter=OVERDUE");
  assert.match(collectionPage, /initialFilter=\{initialFilter\}/);
  assert.match(collectionCenter, /useState<CollectionFilter>\(initialFilter\)/);
  assert.match(collectionCenter, /timeZone: "America\/Santiago"/);
  assert.match(collectionCenter, /if \(filter === "OVERDUE"\) return isOverdue\(invoice, today\)/);
});

test("badge counts actionable cards rather than invoice rows", () => {
  assert.match(repository, /return \{ count: items\.length, items \}/);
  assert.match(dashboard, /founderActions\.length/);
});

test("manual approvals remain individual and P1", () => {
  assert.match(repository, /STAFF_ONBOARDING_REVIEW_REQUIRED/);
  assert.match(repository, /STAFF_EXPENSE_REVIEW_REQUIRED/);
  assert.match(repository, /return "P1"/);
});

test("financial group is P2 and informational work can be P3", () => {
  assert.match(repository, /priority: "P2"/);
  assert.match(repository, /return value === "HIGH" \? "P2" : "P3"/);
});

test("derived financial state cannot be manually archived or resolved", () => {
  assert.match(notificationRepository, /derived:true/);
  assert.match(readFileSync("features/notification-center/notification-center.tsx", "utf8"), /!item\.derived/);
});

test("mobile group card wraps and keeps a reachable CTA", () => {
  assert.match(dashboard, /min-w-0 rounded-xl/);
  assert.match(dashboard, /break-words/);
  assert.match(dashboard, /min-h-11 w-full/);
  assert.match(dashboard, /text-center/);
});

test("grouping migration never changes ledger balances or payment history", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(invoice_payments|receivable_movements|invoices|accounts_receivable_history)/);
});

test("implementation has no production record-specific branching", () => {
  for (const source of [repository, migration, collectionPage, collectionCenter]) {
    assert.doesNotMatch(source, /F276DFD2|Jos[eé] Rodr[ií]guez|2026-826|e5cd5631/);
  }
});
