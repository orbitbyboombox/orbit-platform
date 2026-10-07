import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261006120000_staff_assignment_payment_overrides.sql",
  "utf8",
);
const actions = readFileSync("features/staff-payments/actions.ts", "utf8");
const page = readFileSync("app/(platform)/projects/[projectId]/page.tsx", "utf8");

describe("staff assignment payment overrides", () => {
  it("keeps defaults, stores role-specific overrides, and protects paid rows", () => {
    assert.match(migration, /override_operator_payment numeric/);
    assert.match(migration, /override_assembly_payment numeric/);
    assert.match(migration, /override_disassembly_payment numeric/);
    assert.match(migration, /payment\.settlement_status in \('PAID','FINALIZED'\)/);
    assert.match(migration, /coalesce\(payment\.paid_amount,0\)>0/);
    assert.match(migration, /set_staff_assignment_payment_override/);
    assert.match(migration, /reset_staff_assignment_payment_override/);
  });

  it("routes the Admin UI through the protected RPCs", () => {
    assert.match(actions, /overrideStaffAssignmentPaymentAction/);
    assert.match(actions, /set_staff_assignment_payment_override/);
    assert.match(actions, /reset_staff_assignment_payment_override/);
    assert.match(page, /override_operator_payment/);
    assert.match(page, /finalOperator \+ finalAssembly \+ finalDisassembly/);
    assert.match(page, /assignment_id/);
    assert.match(page, /blockStartAt/);
    assert.match(page, /blockEndAt/);
  });

  it("renders each canonical payment row independently, including block operators", () => {
    const eventUi = readFileSync(
      "features/projects/components/event-ui-replica.tsx",
      "utf8",
    );
    assert.match(eventUi, /staffPayments\.map/);
    assert.match(eventUi, /\$\{payment\.id\}-\$\{payment\.role\}/);
    assert.match(eventUi, /payment\.blockName/);
    assert.match(eventUi, /payment\.blockStartAt/);
    assert.match(eventUi, /EventPaymentAction payment=\{payment\}/);
  });

  it("preserves overrides when default rates are refreshed or blocks are republished", () => {
    assert.match(migration, /override_at is null and override_operator_payment is null/);
    assert.match(migration, /override_at is null and override_assembly_payment is null/);
    assert.match(migration, /override_at is null and override_disassembly_payment is null/);
  });
});
