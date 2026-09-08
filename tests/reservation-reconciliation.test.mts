import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivePipelineStage, hasLegacyReservationEvidence } from "../features/sales-pipeline/domain.ts";
import { normalizeRelatedRows } from "../features/sales-pipeline/domain.ts";

const migration = readFileSync("supabase/migrations/0229_legacy_reservation_reconciliation.sql", "utf8");
const syncMigration = readFileSync("supabase/migrations/0240_reservation_pipeline_sync.sql", "utf8");

test("modern confirmed reservation derives GANADO", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", reservationStatus: "CONFIRMED" }), "GANADO"));
test("legacy confirmed reservation derives GANADO", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", legacyReservationConfirmed: true }), "GANADO"));
test("confirmed commercial stage without canonical evidence remains pending", () => assert.equal(derivePipelineStage({ commercialStage: "Confirmed", reservationStatus: "AWAITING_CONTRACT" }), "RESERVA PENDIENTE"));
test("canonical confirmation overrides a stale active pipeline stage", () => assert.equal(derivePipelineStage({ explicit: "COTIZACIÓN", reservationStatus: "CONFIRMED" }), "GANADO"));
test("closed non-commercial stages remain authoritative", () => assert.equal(derivePipelineStage({ explicit: "PRUEBA", reservationStatus: "CONFIRMED" }), "PRUEBA"));
test("legacy evidence requires all canonical signals", () => {
  assert.equal(hasLegacyReservationEvidence({ commercialStage: "Confirmed", operationalStage: "Reserva confirmada", eventStatuses: [{ status: "ACTIVE" }], financialStatuses: [{ status: "CONFIRMED" }] }), true);
  assert.equal(hasLegacyReservationEvidence({ commercialStage: "Confirmed", operationalStage: "Primer contacto", eventStatuses: [{ status: "ACTIVE" }], financialStatuses: [{ status: "CONFIRMED" }] }), false);
});
test("confirmed reservations synchronize the commercial projection idempotently", () => {
  assert.match(syncMigration, /create or replace function public\.sync_pipeline_from_confirmed_reservation/);
  assert.match(syncMigration, /after insert or update of status on public\.crm_reservations/);
  assert.match(syncMigration, /follow_up_status='CANCELLED'/);
  assert.match(syncMigration, /drop trigger if exists crm_reservations_pipeline_sync/);
  assert.doesNotMatch(syncMigration, /delete\s+from/i);
});
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
