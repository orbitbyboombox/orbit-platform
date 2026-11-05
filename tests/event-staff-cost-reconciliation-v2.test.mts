import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261105194500_event_staff_cost_reconciliation_v2.sql", import.meta.url),
  "utf8",
);

type Row = {
  projectId: string;
  staffId: string;
  assignmentId: string | null;
  settlementId: string;
  concept: string;
  amount: number;
  paid: number;
  source: "ITEM" | "LEGACY";
};

function reconcile(rows: Row[]) {
  const itemKeys = new Set(
    rows.filter((row) => row.source === "ITEM").map((row) => `${row.settlementId}:${row.concept}`),
  );
  return rows.filter(
    (row) => row.source === "ITEM" || !itemKeys.has(`${row.settlementId}:${row.concept}`),
  );
}

test("migration is read-only and preserves historical tariff periods", () => {
  assert.match(sql, /create or replace view public\.event_staff_cost_reconciliation_v2/i);
  assert.match(sql, /event_date <= date '2026-10-31'/i);
  assert.match(sql, /NOV_2026_RECORDED_OR_PERSONALIZED/i);
  assert.doesNotMatch(
    sql,
    /\b(update|insert\s+into|delete\s+from)\s+public\.(event_staff_payments|event_staff_payment_items|event_paper_snapshots|operational_assets)\b/i,
  );
});

test("functional fixture keeps events without staff and marks missing paper rate", () => {
  assert.match(sql, /event_scope as \(/i);
  assert.match(sql, /left join detail d on d\.project_id = s\.project_id/i);
  assert.match(sql, /paper_cost_source/i);
  assert.match(sql, /REVIEW_REQUIRED/i);
  assert.match(sql, /paper_enriched as \([\s\S]*from paper_canonical p/i);
});

test("functional fixture deduplicates legacy concepts when payment items exist", () => {
  const rows: Row[] = [
    { projectId: "ccu", staffId: "s1", assignmentId: "a1", settlementId: "p1", concept: "OPERATOR", amount: 32500, paid: 0, source: "LEGACY" },
    { projectId: "ccu", staffId: "s1", assignmentId: "a1", settlementId: "p1", concept: "OPERATOR", amount: 32500, paid: 0, source: "ITEM" },
    { projectId: "ccu", staffId: "s1", assignmentId: "a2", settlementId: "p2", concept: "ASSEMBLY", amount: 40000, paid: 0, source: "LEGACY" },
  ];
  const result = reconcile(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((row) => row.concept), ["OPERATOR", "ASSEMBLY"]);
  assert.match(sql, /where not exists \([\s\S]*item_concepts/i);
});

test("CCU fixture reconciles 21 payment rows and 11 collaborators without assuming duplicates", () => {
  const rows: Row[] = Array.from({ length: 21 }, (_, index) => ({
    projectId: "ccu",
    staffId: `staff-${index % 11}`,
    assignmentId: `assignment-${index}`,
    settlementId: `payment-${index}`,
    concept: index < 14 ? "OPERATOR" : index < 18 ? "SUPERVISOR" : index < 19 ? "ASSEMBLY" : "DISASSEMBLY",
    amount: index < 18 ? 32500 : 40000,
    paid: 0,
    source: "ITEM" as const,
  }));
  const result = reconcile(rows);
  assert.equal(result.length, 21);
  assert.equal(new Set(result.map((row) => row.staffId)).size, 11);
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 705000);
  assert.match(sql, /project_id, staff_id, assignment_id/i);
});

test("personalized amounts and zero-paid participation are preserved", () => {
  const rows: Row[] = [
    { projectId: "ccu", staffId: "sebastian", assignmentId: "a1", settlementId: "p1", concept: "ASSEMBLY", amount: 40000, paid: 40000, source: "ITEM" },
    { projectId: "ccu", staffId: "matias", assignmentId: "a2", settlementId: "p2", concept: "SUPERVISOR", amount: 0, paid: 0, source: "ITEM" },
  ];
  const result = reconcile(rows);
  assert.deepEqual(result.map((row) => row.amount), [40000, 0]);
  assert.match(sql, /recorded_amount/i);
  assert.match(sql, /PAID|FINALIZED/i);
});

test("Founder/Admin authorization is enforced server-side", () => {
  assert.match(sql, /auth\.uid\(\) is null or not public\.can_administer\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.get_event_staff_cost_reconciliation/i);
  assert.match(sql, /grant execute on function public\.get_event_staff_cost_reconciliation\(uuid\) to authenticated/i);
});

test("branding is represented once and finance categories are explicit", () => {
  assert.match(sql, /distinct on \(o\.project_id\)/i);
  assert.match(sql, /event_finance_costs_v2/i);
  for (const area of ["PERSONAL_Y_OPERACIONES", "INSUMOS_Y_PRODUCCION", "TRANSPORTE_Y_LOGISTICA", "ADMINISTRACION_Y_OFICINA", "EQUIPOS_Y_MANTENIMIENTO", "COMERCIAL_Y_MARKETING"]) {
    assert.match(sql, new RegExp(area));
  }
});
