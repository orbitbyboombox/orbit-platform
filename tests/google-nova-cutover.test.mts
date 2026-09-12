import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("features/connectors/google-workspace/application/google-nova-core.ts", "utf8");
const coreConfig = readFileSync("features/connectors/google-workspace/application/google-nova-config.ts", "utf8");
const repository = readFileSync("features/connectors/google-workspace/application/google-workspace.repository.ts", "utf8");
const calendar = readFileSync("features/connectors/google-calendar/application/google-calendar-sync.service.ts", "utf8");
const migration = readFileSync("supabase/migrations/0254_google_nova_calendar_cutover.sql", "utf8");
const syncRepository = readFileSync("features/connectors/google-calendar/repository/google-calendar-sync.repository.ts", "utf8");
const reconciliation = readFileSync("scripts/reconcile-google-nova-cutover.mjs", "utf8");

test("BOOMBOX uses tenant-authenticated NOVA endpoints without exposing the client token", () => {
  assert.match(core, /x-orbit-client-token/);
  assert.match(core, /ORBIT_ORGANIZATION_ID/);
  assert.match(core, /ORBIT_TENANT_SLUG/);
  assert.doesNotMatch(core, /NEXT_PUBLIC_ORBIT_CONNECT_CLIENT_TOKEN/);
  assert.doesNotMatch(coreConfig, /fetch\(|x-orbit-client-token/);
  assert.match(repository, /usesNOVAGoogleCore/);
});

test("calendar operations target the tenant secondary calendar", () => {
  assert.match(calendar, /loadGoogleWorkspaceCalendarId/);
  assert.match(calendar, /GoogleCalendarApiProvider\(await loadGoogleWorkspaceAccessToken\(\),await loadGoogleWorkspaceCalendarId\(\)\)/);
});

test("calendar migration preserves primary references and is idempotent", () => {
  assert.match(migration, /legacy_external_event_id = coalesce\(legacy_external_event_id, external_event_id\)/);
  assert.match(migration, /add column if not exists nova_external_event_id/);
  assert.match(migration, /create unique index if not exists calendar_sync_nova_external_event_id_uidx/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("NOVA calendar routing reads and writes the migrated identifier without overwriting legacy", () => {
  assert.match(syncRepository, /nova_external_event_id/);
  assert.match(syncRepository, /nova_external_url/);
  assert.match(syncRepository, /usesNOVAGoogleCore/);
  assert.doesNotMatch(syncRepository, /legacy_external_event_id:\s*record\.googleEventId/);
});

test("calendar reconciliation is retry-safe and compares Google-normalized times semantically", () => {
  assert.match(reconciliation, /privateExtendedProperty/);
  assert.match(reconciliation, /orbitProjectId/);
  assert.match(reconciliation, /sameCalendarMoment/);
  assert.match(reconciliation, /sendUpdates.*none/);
  assert.doesNotMatch(reconciliation, /method:\s*"DELETE"/);
});
