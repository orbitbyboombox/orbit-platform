import assert from "node:assert/strict";
import test from "node:test";
import { isInvalidSessionError, isTransientSupabaseTransportError } from "../lib/supabase/auth-errors.ts";
import { readFileSync } from "node:fs";

test("transport interruption is not treated as an invalid session", () => {
  const error = Object.assign(new Error("fetch failed: connection reset"), { name: "TypeError" });
  assert.equal(isInvalidSessionError(error), false);
  assert.equal(isTransientSupabaseTransportError(error), true);
  assert.equal(isTransientSupabaseTransportError(new Error("JWT expired")), false);
});

test("protected shell preserves identity and renders recovery state for transient Supabase failure", () => {
  const middleware = readFileSync("lib/supabase/middleware.ts", "utf8");
  const layout = readFileSync("app/(platform)/layout.tsx", "utf8");
  assert.match(middleware, /isTransientSupabaseTransportError/);
  assert.match(middleware, /if \(isTransientSupabaseTransportError\(error\)\) return response/);
  assert.match(layout, /Tu sesión y permisos se mantienen intactos/);
  assert.match(layout, /isTransientSupabaseTransportError\(profileError\)/);
  assert.doesNotMatch(layout, /profileError\) redirect\("\/login/);
});
