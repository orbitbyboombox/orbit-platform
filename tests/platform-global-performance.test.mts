import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("platform navigation refreshes the session and leaves the role lookup to the protected layout", () => {
  const middleware = source("lib/supabase/middleware.ts");
  const layout = source("app/(platform)/layout.tsx");
  assert.match(middleware, /platformPagePrefixes/);
  assert.match(middleware, /supabase\.auth\.getUser\(\)/);
  assert.ok(middleware.indexOf("if(platformPagePrefixes.some") < middleware.indexOf('supabase.from("profiles")'));
  assert.match(layout, /getSupabaseRenderUser\(\)/);
  assert.match(layout, /profiles/);
});

test("resilient sync defers first remote refresh until after first paint", () => {
  const provider = source("components/resilient-sync/resilient-sync-provider.tsx");
  assert.match(provider, /setTimeout\(startBackgroundSync, 900\)/);
  assert.doesNotMatch(provider, /void refresh\(\)\.finally\(scheduleRefresh\);\n    return/);
});

test("platform has an immediate route loading boundary", () => {
  const loading = source("app/(platform)/loading.tsx");
  assert.match(loading, /animate-pulse/);
  assert.match(loading, /PlatformLoading/);
});
