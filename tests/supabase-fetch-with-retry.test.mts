import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithSupabasePoolRetry } from "../lib/supabase/fetch-with-retry.ts";

test("Supabase transport retries an abort and returns the successful response", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new DOMException("timed out", "AbortError");
    return new Response("ok", { status: 200 });
  };
  try {
    const response = await fetchWithSupabasePoolRetry("https://example.invalid");
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase transport fails closed after repeated aborts without leaking AbortError", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new DOMException("timed out", "AbortError");
  };
  try {
    const response = await fetchWithSupabasePoolRetry("https://example.invalid");
    assert.equal(response.status, 504);
    assert.equal(response.headers.get("x-orbit-supabase-transport-timeout"), "1");
    assert.equal((await response.json()).code, "PGRST003");
    assert.ok(attempts <= 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase transport stays within one total auth budget", async () => {
  const originalFetch = globalThis.fetch;
  const started = Date.now();
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new DOMException("timed out", "AbortError");
  };
  try {
    const response = await fetchWithSupabasePoolRetry("https://example.invalid/auth/v1/user");
    assert.equal(response.status, 504);
    assert.ok(Date.now() - started < 7_500);
    assert.ok(attempts <= 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
