import assert from "node:assert/strict";
import test from "node:test";
import { readCommunicationPreview } from "../features/projects/communications/communication-preview.ts";

test("both previews use independent, noncached reads and preserve the server result", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.equal(options.method ?? "GET", "GET");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return Response.json({ ok: true, preview: { history: [] } });
  });

  const results = await Promise.all([
    readCommunicationPreview("event-id", "reminder"),
    readCommunicationPreview("event-id", "photos"),
  ]);
  assert.deepEqual(calls, [
    "/api/projects/event-id/communications/reminder",
    "/api/projects/event-id/communications/photos",
  ]);
  assert.deepEqual(results, [
    { ok: true, preview: { history: [] } },
    { ok: true, preview: { history: [] } },
  ]);
});

test("an expired session ends the preview load with a recoverable error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Acceso</html>", {
    headers: { "Content-Type": "text/html" },
  }));
  await assert.rejects(readCommunicationPreview("event-id", "photos"), /Verifica tu sesión/);
});
