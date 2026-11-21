import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("platform middleware skips a duplicate profile query while keeping session refresh and layout authorization", () => {
  const middleware = source("lib/supabase/middleware.ts");
  const layout = source("app/(platform)/layout.tsx");
  assert.match(middleware, /platformPagePrefixes/);
  assert.match(middleware, /platformPagePrefixes\.some[\s\S]*return response/);
  assert.match(middleware, /supabase\.auth\.getUser\(\)/);
  assert.match(layout, /client\.auth\.getUser\(\)/);
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
