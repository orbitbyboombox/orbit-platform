import test from "node:test";
import assert from "node:assert/strict";
import { assertSupabaseEnvironmentSafe, productionSupabaseProjectRef, resolveOrbitEnvironment } from "../lib/supabase/environment-guard.ts";

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
