import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0191_fix_staff_expense_operational_association.sql", "utf8");
const page = readFileSync("app/(platform)/projects/[projectId]/staff-expenses/page.tsx", "utf8");
const review = readFileSync("features/staff-expenses/staff-expense-review.tsx", "utf8");
const action = readFileSync("features/staff-expenses/staff-expense-review.actions.ts", "utf8");

test("approval resolves the Event association from the persisted submission", () => {
  assert.match(migration, /'associationType','EVENT'/);
  assert.match(migration, /'associationId',item\.project_id/);
  assert.doesNotMatch(migration, /p_project_id/);
});

test("approval validates an existing active Staff assignment", () => {
  assert.match(migration, /from public\.assignments a/);
  assert.match(migration, /a\.project_id=item\.project_id/);
  assert.match(migration, /a\.staff_id=item\.staff_id/);
  assert.match(migration, /a\.status in\('CONFIRMED','ACCEPTED','COMPLETED'\)/);
  assert.match(migration, /'assignmentIds',to_jsonb\(assignment_ids\)/);
});

test("reimbursement target is the matching confirmed Event settlement", () => {
  assert.match(migration, /s\.project_id=item\.project_id/);
  assert.match(migration, /s\.staff_id=item\.staff_id/);
  assert.match(migration, /s\.status='CONFIRMED'/);
  assert.match(migration, /if item\.reimbursement and settlement_id is null/);
});

test("approval metadata satisfies the global operational owner guard", () => {
  assert.match(migration, /'responsibleStaffId',item\.staff_id/);
  assert.match(migration, /'eventStaffSettlementId',case when item\.reimbursement then settlement_id/);
});

test("Staff reimbursement and direct Event cost remain explicit", () => {
  assert.match(migration, /'STAFF_REIMBURSEMENT'/);
  assert.match(migration, /'EVENT_DIRECT'/);
});

test("approved expense is materialized exactly once", () => {
  assert.match(migration, /if item\.status='APPROVED' then return item\.materialized_expense_id/);
  assert.match(migration, /'staff-expense-submission:'\|\|item\.id/);
  assert.match(migration, /on conflict\(idempotency_key\)/);
});

test("receipt document links to the materialized expense", () => {
  assert.match(migration, /update public\.documents/);
  assert.match(migration, /staff_expense_submission_id=item\.id/);
  assert.match(migration, /set expense_id=created_expense_id/);
});

test("failed association validation cannot partially approve the submission", () => {
  const expenseInsert = migration.indexOf("insert into public.expenses");
  assert.ok(migration.indexOf("if coalesce(cardinality(assignment_ids),0)=0") < expenseInsert);
  assert.ok(migration.indexOf("if item.reimbursement and settlement_id is null") < expenseInsert);
  assert.ok(migration.indexOf("set status='APPROVED'") > expenseInsert);
});

test("rejection remains independent from operational association", () => {
  assert.ok(migration.indexOf("if p_action='REJECT' then") < migration.indexOf("from public.assignments a"));
  assert.match(migration, /set status='REJECTED'/);
});

test("review page projects assignment and settlement from the same Event", () => {
  assert.match(page, /from\("assignments"\)/);
  assert.match(page, /from\("event_staff_payments"\)/);
  assert.match(page, /\.eq\("project_id",projectId\)/);
  assert.match(page, /filter\(row=>row\.staff_id===item\.staff_id\)/);
});

test("Founder sees the resolved association before approval", () => {
  assert.match(review, /Asociación operacional/);
  assert.match(review, /Destino de reembolso/);
  assert.match(review, /Liquidación Staff CONFIRMADA/);
});

test("unresolved association disables approval with an explicit reason", () => {
  assert.match(review, /disabled=\{pending\|\|!associationReady\}/);
  assert.match(review, /No se puede aprobar hasta corregir la asociación canónica/);
});

test("touch actions are explicit full-width controls on mobile", () => {
  assert.match(review, /min-h-11 w-full/);
  assert.match(review, /type="button"/);
  assert.match(review, /Procesando…/);
});

test("provider errors are exposed through an aria-live status", () => {
  assert.match(review, /aria-live="polite"/);
  assert.match(action, /return \{ ok: false, message: error\.message \}/);
});

test("approval keeps canonical recalculation and Founder alert lifecycle", () => {
  assert.match(migration, /sync_event_operation_cost\(item\.project_id\)/);
  assert.match(migration, /set status='APPROVED',materialized_expense_id/);
});

test("hotfix does not touch customer billing or Payment Ledger", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(invoices|invoice_payments|receivable_movements)/);
});

test("hotfix contains no José or record-specific production branch", () => {
  assert.doesNotMatch(migration, /Jos[eé]|729ed7c9|50c5e69f|bd31d438|ORB-2026-632266/);
  assert.doesNotMatch(review, /Jos[eé]|729ed7c9|50c5e69f|bd31d438|ORB-2026-632266/);
});
