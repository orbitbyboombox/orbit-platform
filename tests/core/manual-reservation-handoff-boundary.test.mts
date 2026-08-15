import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/0139_manual_reservation_operational_handoff_boundary.sql",
  import.meta.url,
);

test("manual reservations defer Operations until commercial confirmation", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /if reservation_status='CONFIRMED' then[\s\S]*ensure_event_operational_handoff/,
  );
  assert.match(migration, /'status','DEFERRED'/);
  assert.match(migration, /'reason','COMMERCIAL_CONFIRMATION_PENDING'/);
});

test("contract or payment confirmation automatically starts the handoff", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /if next_status='CONFIRMED' then[\s\S]*ensure_event_operational_handoff/,
  );
  assert.match(
    migration,
    /commercial_reservation_status\(next_status\)/,
  );
});
