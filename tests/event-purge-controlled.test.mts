import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0244_event_purge_controlled.sql", "utf8");
const action = readFileSync("features/projects/actions/reservation-lifecycle.actions.ts", "utf8");
const center = readFileSync("features/crm/event-center.tsx", "utf8");

test("purge is Founder-gated, scoped by project and never deletes customer", () => {
  assert.match(sql, /public\.can_administer\(\)/);
  assert.match(sql, /where id=p_project_id/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.customers/i);
  assert.match(sql, /status='DELETED'/);
});

test("legal payment and signed-document guards fail closed", () => {
  assert.match(sql, /paid_amount/);
  assert.match(sql, /signed_at/);
  assert.match(sql, /external_tax_document_type/);
  assert.match(sql, /requiere reversa/);
});

test("immutable audit remains a tombstone and repeated purge is safe", () => {
  assert.match(sql, /already_deleted/);
  assert.match(sql, /ALREADY_DELETED/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(timeline_events|reservation_lifecycle_events|reservation_commercial_negotiations)/i);
});

test("UI requires explicit ELIMINAR confirmation for permanent delete", () => {
  assert.match(action, /confirmation!=="ELIMINAR"/);
  assert.match(center, /Escribe ELIMINAR/);
});

test("archive remains a separate lifecycle action", () => {
  assert.match(action, /transition_reservation_lifecycle/);
  assert.match(action, /purge_event_controlled/);
});
