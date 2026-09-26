import test from "node:test";
import assert from "node:assert/strict";
import { assertSupabaseEnvironmentSafe, isReadOnlyVisualPreview, productionSupabaseProjectRef, resolveOrbitEnvironment } from "../lib/supabase/environment-guard.ts";

const productionUrl = `https://${productionSupabaseProjectRef}.supabase.co`;
const testUrl = "https://bianca-test-project.supabase.co";

test("TEST environment rejects the known production Supabase project", () => {
  assert.throws(
    () => assertSupabaseEnvironmentSafe(productionUrl, { ORBIT_ENVIRONMENT: "test" }),
    /SUPABASE_PRODUCTION_TARGET_BLOCKED/,
  );
});

test("TEST environment accepts an independent project ref", () => {
  assert.deepEqual(assertSupabaseEnvironmentSafe(testUrl, { ORBIT_ENVIRONMENT: "test" }), {
    environment: "test",
    projectRef: "bianca-test-project",
    productionMatch: false,
  });
});

test("environment classification is explicit and fail-closed for unknown values", () => {
  assert.equal(resolveOrbitEnvironment({ ORBIT_ENVIRONMENT: "test" }), "test");
  assert.equal(resolveOrbitEnvironment({ ORBIT_ENVIRONMENT: "production" }), "production");
  assert.equal(resolveOrbitEnvironment({}), "unknown");
});

test("allows production target only for explicit read-only visual preview", () => {
  const env = { VERCEL_ENV: "preview", ORBIT_READ_ONLY_VISUAL_PREVIEW: "true" };
  assert.equal(isReadOnlyVisualPreview(env), true);
  assert.deepEqual(assertSupabaseEnvironmentSafe(productionUrl, env), {
    environment: "preview",
    projectRef: productionSupabaseProjectRef,
    productionMatch: true,
  });
});

test("does not treat an ordinary preview as read-only visual preview", () => {
  assert.equal(isReadOnlyVisualPreview({ VERCEL_ENV: "preview" }), false);
});
