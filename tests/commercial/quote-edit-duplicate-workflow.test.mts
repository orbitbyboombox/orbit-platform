import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const actions = readFileSync(new URL("../../features/commercial-hub/actions.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20261030100000_commercial_quote_edit_duplicate.sql", import.meta.url), "utf8");
const detail = readFileSync(new URL("../../features/commercial-hub/quote-detail-experience.tsx", import.meta.url), "utf8");
const detailUi = readFileSync(new URL("../../features/commercial-hub/quote-detail-experience.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../../features/commercial-hub/repository.ts", import.meta.url), "utf8");

test("commercial quote editing uses the canonical atomic persistence boundary", () => {
  assert.match(actions, /save_commercial_quote_draft/);
  assert.match(actions, /prepareCommercialQuoteRevisionAction/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /prepare_commercial_quote_revision/);
  assert.match(migration, /status not in \('ACCEPTED', 'CONVERTED'\)/);
});

test("duplication creates a new draft without copying operational or financial records", () => {
  assert.match(actions, /duplicateCommercialQuoteAction/);
  assert.match(migration, /duplicate_commercial_quote/);
  assert.match(migration, /new_id uuid := gen_random_uuid/);
  assert.match(migration, /status,\s*customer_type/);
  assert.match(migration, /project_id, orbit_event_id, status/);
  assert.doesNotMatch(migration, /insert into public\.(payments|invoices|projects|reservations)/i);
});

test("detail exposes edit, duplicate and protected accepted/conversion revision actions", () => {
  assert.match(detail, /CONTINUAR EDITANDO/);
  assert.match(detail, /DUPLICAR \/ USAR COMO BASE/);
  assert.match(detail, /PREPARAR MODIFICACIÓN/);
  assert.match(repository, /quote_versions/);
});


test("duplicate requests have a persisted atomic idempotency claim and stable UI request key", () => {
  assert.match(migration, /commercial_quote_duplication_requests/);
  assert.match(migration, /primary key \(actor_id, request_id\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(actor::text/);
  assert.match(migration, /prior_request\.payload_hash <> request_hash/);
  assert.match(migration, /'ALREADY_DUPLICATED'/);
  assert.match(actions, /p_request_id: input\.requestId/);
  assert.match(detailUi, /duplicateRequestId\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(detailUi, /quoteId: quote\.id, requestId/);
});
