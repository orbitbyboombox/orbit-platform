import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCanonicalStaffFinancials } from "../features/staff-payments/canonical-staff-financials.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261031120000_staff_payment_concepts_integrity.sql", import.meta.url), "utf8");

test("canonicaliza supervisor, montaje, desmontaje y capacitación en $48.000", () => {
  const result = buildCanonicalStaffFinancials({
    projectId: "project-1",
    settlements: [{
      id: "settlement-1",
      staffId: "sebastian",
      assignmentId: "assignment-supervisor",
      status: "PAID",
      operatorPayment: 19000,
      assemblyPayment: 7000,
      disassemblyPayment: 8000,
      paidAmount: 34000,
    }],
    paymentItems: [{
      id: "training-1",
      projectId: "project-1",
      staffId: "sofia",
      assignmentId: "assignment-training",
      concept: "TRAINING",
      amount: 14000,
      paidAmount: 0,
      status: "PENDING",
      source: "PAYMENT_ITEM",
    }],
    assignments: [
      { id: "assignment-supervisor", staffId: "sebastian", role: "SUPERVISOR", status: "COMPLETED" },
      { id: "assignment-assembly", staffId: "sebastian", role: "ASSEMBLY", status: "COMPLETED" },
      { id: "assignment-disassembly", staffId: "sebastian", role: "DISASSEMBLY", status: "COMPLETED" },
      { id: "assignment-training", staffId: "sofia", role: "TRAINING", status: "CONFIRMED" },
    ],
  });
  assert.equal(result.total, 48000);
  assert.deepEqual(result.byConcept, {
    OPERATOR: 0,
    SUPERVISOR: 19000,
    ASSEMBLY: 7000,
    DISASSEMBLY: 8000,
    TRAINING: 14000,
  });
  assert.equal(result.paid, 34000);
});

test("marca revisión cuando existe asignación activa sin línea de pago", () => {
  const result = buildCanonicalStaffFinancials({
    projectId: "project-1",
    settlements: [],
    assignments: [{ id: "missing-payment", staffId: "sofia", role: "TRAINING", status: "CONFIRMED" }],
  });
  assert.deepEqual(result.reviewRequiredAssignmentIds, ["missing-payment"]);
});

test("no duplica líneas idempotentes ni cambia pagos históricos en el read model", () => {
  const result = buildCanonicalStaffFinancials({
    projectId: "project-1",
    settlements: [{ id: "paid", staffId: "sebastian", assignmentId: "a", status: "PAID", operatorPayment: 19000, paidAmount: 19000 }],
    paymentItems: [{ id: "paid:OPERATOR", projectId: "project-1", staffId: "sebastian", assignmentId: "a", concept: "OPERATOR", amount: 19000, paidAmount: 19000, status: "PAID", source: "PAYMENT_ITEM" }],
    assignments: [{ id: "a", staffId: "sebastian", role: "OPERATOR", status: "COMPLETED" }],
  });
  assert.equal(result.total, 19000);
});

test("aísla asignaciones de otros eventos antes de calcular revisión y totales", () => {
  const result = buildCanonicalStaffFinancials({
    projectId: "project-1",
    settlements: [{ id: "paid", staffId: "sebastian", assignmentId: "local", status: "PAID", operatorPayment: 34000, paidAmount: 34000 }],
    assignments: [
      { id: "local", projectId: "project-1", staffId: "sebastian", role: "OPERATOR", status: "COMPLETED" },
      { id: "foreign", projectId: "project-2", staffId: "other", role: "TRAINING", status: "CONFIRMED" },
    ],
  });
  assert.equal(result.total, 34000);
  assert.deepEqual(result.reviewRequiredAssignmentIds, []);
});

test("el modelo descarta líneas de pago pertenecientes a otro evento", () => {
  const result = buildCanonicalStaffFinancials({
    projectId: "project-1",
    settlements: [],
    paymentItems: [
      { id: "local", projectId: "project-1", staffId: "sebastian", concept: "SUPERVISOR", amount: 19000, paidAmount: 0, status: "PENDING", source: "PAYMENT_ITEM" },
      { id: "foreign", projectId: "project-2", staffId: "other", concept: "TRAINING", amount: 14000, paidAmount: 0, status: "PENDING", source: "PAYMENT_ITEM" },
    ],
    assignments: [],
  });
  assert.equal(result.total, 19000);
  assert.deepEqual(result.items.map((item) => item.id), ["local"]);
});

test("la página mantiene el filtro project_id en la lectura defensiva", () => {
  const page = readFileSync(new URL("../app/(platform)/projects/[projectId]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.eq\("project_id", projectId\)/);
  assert.match(page, /item\.project_id === projectId/);
});

test("la migración protege autorización, coherencia y concurrencia", () => {
  assert.match(migration, /assignment_project_id uuid/);
  assert.match(migration, /assignment_project_id <> p_project_id/);
  assert.match(migration, /on conflict do nothing returning \* into current_item/);
  assert.match(migration, /staff_payment_concept_totals\(uuid\) from public/);
  assert.match(migration, /not public\.can_administer\(\)/);
});
