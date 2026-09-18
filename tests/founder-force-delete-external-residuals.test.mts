import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260918010000_founder_force_delete_external_residuals.sql", "utf8");
const cleanup = readFileSync("features/projects/event-deletion-cleanup.service.ts", "utf8");
const action = readFileSync("features/projects/actions/reservation-lifecycle.actions.ts", "utf8");
const inbox = readFileSync("features/notification-center/notification-center.tsx", "utf8");

test("external cleanup has terminal residual-aware statuses and an auditable residual payload", () => {
  assert.match(migration, /COMPLETED_WITH_EXTERNAL_RESIDUALS/);
  assert.match(migration, /FAILED_RETRYABLE/);
  assert.match(migration, /FAILED_MANUAL_ACTION_REQUIRED/);
  assert.match(migration, /cleanup_residuals jsonb/);
  assert.match(cleanup, /appNotAuthorizedToChild/);
  assert.match(cleanup, /requiresManualAction/);
  assert.match(cleanup, /DRIVE_EXTERNAL_OWNERSHIP/);
  assert.match(cleanup, /SHARED_PARENT_PRESERVED/);
});

test("Founder receives the residual-specific outcome and a cleanup review entry point", () => {
  assert.match(action, /Evento eliminado de ORBIT\. Quedaron \$\{residualCount\} archivos históricos en Google Drive/);
  assert.match(inbox, /Ver pendientes de limpieza externa/);
  assert.match(inbox, /Eventos eliminados con residuales Drive/);
});
