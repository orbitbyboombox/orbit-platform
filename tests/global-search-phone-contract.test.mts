import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260925203000_global_search_phone_e164_parity.sql", import.meta.url), "utf8");

test("global search uses exact E.164 matching for explicit international queries", () => {
  assert.match(migration, /left\(trim\(coalesce\(p_query, ''\)\), 1\) = '\+'/);
  assert.match(migration, /public\.normalize_phone_e164\(p_query\)/);
  assert.match(migration, /c\.phone_e164 = i\.phone_term/);
  assert.match(migration, /public\.normalize_phone_e164\(c\.phone\) = i\.phone_term/);
});

test("global search does not add an implicit Chile country prefix", () => {
  assert.doesNotMatch(migration, /\+56/);
  assert.doesNotMatch(migration, /569\s*\|\|/);
});

test("legacy fallback is limited to rows without canonical phone", () => {
  assert.match(migration, /c\.phone_e164 is null and public\.normalize_phone_e164\(c\.phone\)/);
});
