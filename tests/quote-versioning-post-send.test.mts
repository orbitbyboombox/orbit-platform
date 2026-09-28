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
  assert.match(source, /from\("quote_versions"\)/);
  assert.match(source, /version_number/);
  assert.match(source, /currentVersion\.version_number/);
  assert.doesNotMatch(source, /const version = Math\.max\(1, Number\(quote\.version/);
  assert.match(source, /_V\$\{version\}\.pdf/);
  assert.match(source, /upsert: false/);
  assert.match(source, /versionUpdateError/);
});

test("quote send exposes the failing pipeline stage with database details", async () => {
  const source = await readFile(actions, "utf8");
  for (const stage of ["QUOTE_SEND_LOAD", "QUOTE_SEND_VERSION", "QUOTE_SEND_PDF", "QUOTE_SEND_STORAGE", "QUOTE_SEND_SIGNED_URL", "QUOTE_SEND_CLAIM", "QUOTE_SEND_GMAIL", "QUOTE_SEND_VERSION_UPDATE", "QUOTE_SEND_QUOTE_UPDATE"]) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /QUOTE_SEND_FAILURE/);
  assert.match(source, /technical\?\.code/);
  assert.match(source, /technical\?\.details/);
});

test("quote detail exposes history and post-acceptance revision action", async () => {
  const source = await readFile(detail, "utf8");
  assert.match(source, /canCreatePostAcceptanceRevision/);
  assert.match(source, /versions:/);
  assert.match(source, /canEdit: \["DRAFT", "SENT", "VIEWED", "NEGOTIATION"\]/);
});
