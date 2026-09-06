import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivePipelineStage } from "../features/sales-pipeline/domain.ts";
import { normalizeRelatedRows } from "../features/sales-pipeline/domain.ts";

const migration = readFileSync("supabase/migrations/0229_legacy_reservation_reconciliation.sql", "utf8");

test("modern confirmed reservation derives GANADO", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", reservationStatus: "CONFIRMED" }), "GANADO"));
test("legacy confirmed reservation derives GANADO", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", legacyReservationConfirmed: true }), "GANADO"));
test("confirmed commercial stage without canonical evidence remains pending", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", reservationStatus: "AWAITING_CONTRACT" }), "RESERVA PENDIENTE"));
test("legacy reconciliation is global, idempotent and non-destructive", () => {
  assert.match(migration, /project_has_canonical_reservation/);
  assert.match(migration, /set pipeline_stage='GANADO'/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.match(migration, /where p\.id=p_project_id/);
});
test("normalizes crm_events arrays", () => assert.equal(normalizeRelatedRows([{ status: "ACTIVE" }]).length, 1));
test("normalizes crm_events object embeds", () => assert.equal(normalizeRelatedRows({ status: "ACTIVE" })[0]?.status, "ACTIVE"));
test("normalizes null crm_events safely", () => assert.deepEqual(normalizeRelatedRows(null), []));
test("normalizes unexpected crm_events shapes safely", () => assert.deepEqual(normalizeRelatedRows("unexpected"), []));
