import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = new URL("../supabase/migrations/20260928160000_quote_versioning_post_send.sql", import.meta.url);
const actions = new URL("../features/commercial-hub/actions.ts", import.meta.url);
const detail = new URL("../features/commercial-hub/quote-detail.ts", import.meta.url);

test("quote versioning preserves sent history and freezes accepted version", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create table if not exists public\.quote_versions/);
  assert.match(sql, /unique \(quote_id, version_number\)/);
  assert.match(sql, /current_version_id/);
  assert.match(sql, /accepted_version_id/);
  assert.match(sql, /create_post_acceptance_quote_revision/);
  assert.match(sql, /q\.status<>'ACCEPTED' or q\.accepted_version_id is null/);
});

test("resending a quote uses a versioned immutable PDF path", async () => {
  const source = await readFile(actions, "utf8");
  assert.match(source, /ensure_current_quote_version/);
  assert.match(source, /_V\$\{version\}\.pdf/);
  assert.match(source, /upsert: false/);
  assert.match(source, /versionUpdateError/);
});

test("quote detail exposes history and post-acceptance revision action", async () => {
  const source = await readFile(detail, "utf8");
  assert.match(source, /canCreatePostAcceptanceRevision/);
  assert.match(source, /versions:/);
  assert.match(source, /canEdit: \["DRAFT", "SENT", "VIEWED", "NEGOTIATION"\]/);
});
