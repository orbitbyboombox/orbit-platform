import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { officialStaffRateCodeForMinutes, resolveOfficialOperatorRate } from "../features/operations/staff-assignment-payment.ts";

const root = join(process.cwd());
const migration = readFileSync(join(root, "supabase/migrations/20260922113000_staff_block_assignment_rates.sql"), "utf8");
const fiveHourMigration = readFileSync(join(root, "supabase/migrations/20260922115000_staff_five_hour_rate.sql"), "utf8");
const scopeMigration = readFileSync(join(root, "supabase/migrations/20260922114000_staff_block_payment_scope.sql"), "utf8");
const ui = readFileSync(join(root, "features/staff-assignment-center/staff-assignment-center.tsx"), "utf8");

test("270 minutes resolve the canonical 4.5h operator tariff", () => {
  assert.equal(officialStaffRateCodeForMinutes(270), "OPERATOR_4_5_HOURS");
  assert.deepEqual(resolveOfficialOperatorRate([{ code: "OPERATOR_4_5_HOURS", amount: 26500 }], 270), { code: "OPERATOR_4_5_HOURS", amount: 26500 });
});

test("300 minutes resolve the existing 5h operator tariff", () => {
  assert.equal(officialStaffRateCodeForMinutes(300), "OPERATOR_5_HOURS");
  assert.equal(resolveOfficialOperatorRate([{ code: "OPERATOR_5_HOURS", amount: 28000 }], 300).amount, 28000);
  assert.match(fiveHourMigration, /amount=28000/);
});

test("unknown duration fails closed to REVIEW_REQUIRED", () => {
  assert.equal(officialStaffRateCodeForMinutes(255), null);
  assert.equal(resolveOfficialOperatorRate([], 255).amount, null);
  assert.match(migration, /REVIEW_REQUIRED/);
});

test("block assignment allows non-overlap and guards overlap server-side", () => {
  assert.match(migration, /existing_block\.start_at<incoming_block\.end_at/);
  assert.match(migration, /El colaborador ya está asignado a un bloque que se solapa/);
  assert.match(migration, /block_id=incoming\.block_id/);
  assert.match(migration, /assignments_active_block_responsibility_idx/);
});

test("block costs and payments preserve block context", () => {
  assert.match(migration, /event_staff_block_costs\(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes/);
  assert.match(migration, /contracted_minutes/);
  assert.match(scopeMigration, /event_staff_payments_active_block_scope_idx/);
});

test("Founder UI assigns explicitly inside each operational block", () => {
  assert.match(ui, /Asignar \{roleLabel\(item\.role\)\}/);
  assert.match(ui, /name="blockId"/);
  assert.match(ui, /Planificación por bloques/);
  assert.match(ui, /\{item\.assigned\}\/\{item\.required\}/);
});

test("legacy event-level assignments remain separate from block assignments", () => {
  assert.match(migration, /block_id is null and deleted_at is null and status not in/);
  assert.match(scopeMigration, /block_id is null and deleted_at is null and status<>'CANCELLED'/);
});
