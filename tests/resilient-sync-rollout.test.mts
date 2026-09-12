import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("BOOMBOX mounts one global resilient indicator without exposing bridge secrets", () => {
  const layout = read("app/(platform)/layout.tsx");
  const shell = read("components/layout/app-shell.tsx");
  const header = read("components/layout/header.tsx");
  assert.match(layout, /RESILIENT_SYNC_ENABLED/);
  assert.match(shell, /ResilientSyncProvider/);
  assert.match(header, /ResilientSyncIndicator/);
  assert.doesNotMatch(`${layout}${shell}${header}`, /ORBIT_CONNECT_CLIENT_TOKEN|ORBIT_SYNC_ADAPTER_SECRET/);
});

test("BOOMBOX offline drafts reuse canonical quote and reservation paths", () => {
  const adapters = read("lib/resilient-sync/adapters.ts");
  const quote = read("features/commercial-hub/commercial-hub.tsx");
  const reservation = read("features/projects/components/new-project-drawer.tsx");
  assert.match(adapters, /prepareFormalQuotePersistence/);
  assert.match(adapters, /save_commercial_quote_draft/);
  assert.match(adapters, /SupabaseCustomerRepository/);
  assert.match(adapters, /createWithProject/);
  assert.match(quote, /resourceType:\s*"QUOTE_DRAFT"/);
  assert.match(reservation, /resourceType:\s*"RESERVATION_DRAFT"/);
  assert.doesNotMatch(adapters, /confirmPersistedReservation|sendReservationConfirmation|PAYMENT/);
});

test("logout no longer owns queue deletion and files are delegated as idempotent jobs", () => {
  const provider = read("components/resilient-sync/resilient-sync-provider.tsx");
  const files = read("app/api/resilient-sync/files/route.ts");
  assert.match(provider, /installed\.destroy\(\)/);
  assert.doesNotMatch(provider, /clearLocalData|clearUserData/);
  assert.match(files, /idempotency_key:\s*`file:/);
  assert.match(files, /DRIVE_UPLOAD/);
});
