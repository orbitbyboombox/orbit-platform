import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("protected server renders share Supabase user validation within the request", () => {
  const server = source("lib/supabase/server.ts");
  assert.match(server, /getSupabaseRenderUser = cache\([\s\S]*?client\.auth\.getUser\(\)/);
  for (const file of [
    "app/(platform)/layout.tsx",
    "app/(platform)/operations/page.tsx",
    "app/(platform)/projects/[projectId]/page.tsx",
    "app/(platform)/finance/tributary/accounting/page.tsx",
  ]) {
    assert.match(source(file), /await getSupabaseRenderUser\(\)/);
    assert.doesNotMatch(source(file), /client\.auth\.getUser\(\)/);
  }
});
