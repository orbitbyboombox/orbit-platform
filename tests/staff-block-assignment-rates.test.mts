import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { officialStaffRateCodeForMinutes, resolveOfficialOperatorRate } from "../features/operations/staff-assignment-payment.ts";

const root = join(process.cwd());
const migration = readFileSync(join(root, "supabase/migrations/20260922113000_staff_block_assignment_rates.sql"), "utf8");
const officialRateMigration = readFileSync(join(root, "supabase/migrations/20260922121000_official_operator_rate_table.sql"), "utf8");
const scopeMigration = readFileSync(join(root, "supabase/migrations/20260922114000_staff_block_payment_scope.sql"), "utf8");
const ui = readFileSync(join(root, "features/staff-assignment-center/staff-assignment-center.tsx"), "utf8");

const officialRates = [
  [2, 14000], [3, 19000], [4, 24000], [5, 27000], [6, 32000],
  [7, 37000], [8, 42000], [9, 47000], [10, 52000],
].map(([hours, amount]) => ({ code: `OPERATOR_${hours}_HOURS`, amount }));

test("official whole-hour operator tariffs resolve exactly", () => {
  for (const [hours, amount] of [[2, 14000], [3, 19000], [4, 24000], [5, 27000], [6, 32000], [7, 37000], [8, 42000], [9, 47000], [10, 52000]]) {
    assert.equal(officialStaffRateCodeForMinutes(hours * 60), `OPERATOR_${hours}_HOURS`);
    assert.equal(resolveOfficialOperatorRate(officialRates, hours * 60).amount, amount);
  }
});

test("270 minutes interpolate the official 4.5h operator tariff", () => {
  assert.equal(officialStaffRateCodeForMinutes(270), null);
  assert.equal(resolveOfficialOperatorRate(officialRates, 270).amount, 25500);
  assert.equal(resolveOfficialOperatorRate(officialRates, 330).amount, 29500);
  assert.match(officialRateMigration, /\(5,27000::numeric\)/);
});

test("unknown duration fails closed to REVIEW_REQUIRED", () => {
  assert.equal(resolveOfficialOperatorRate(officialRates, 119).amount, null);
  assert.equal(resolveOfficialOperatorRate(officialRates, 601).amount, null);
  assert.match(migration, /REVIEW_REQUIRED/);
});

test("official rate migration contains the Founder table and interpolation", () => {
  assert.match(officialRateMigration, /\(5,27000::numeric\)/);
  assert.match(officialRateMigration, /resolve_staff_operator_rate/);
  assert.match(officialRateMigration, /amount=25500/);
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
