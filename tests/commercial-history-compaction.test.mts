import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("unified history is compact by default and expands on demand", async () => {
  const source = await read("features/communication-hub/components/communication-hub.tsx");
  assert.match(source, /historyOpen/);
  assert.match(source, /Ver historial completo/);
  assert.match(source, /max-h-\[28rem\]/);
});

test("send history is compact by default with bounded expansion", async () => {
  const source = await read("features/commercial-hub/commercial-hub.tsx");
  assert.match(source, /Ver envíos/);
  assert.match(source, /max-h-80/);
  assert.match(source, /Último envío/);
});

test("history compaction does not add destructive operations", async () => {
  const communication = await read("features/communication-hub/components/communication-hub.tsx");
  const commercial = await read("features/commercial-hub/commercial-hub.tsx");
  assert.doesNotMatch(`${communication}\n${commercial}`, /delete\s+from|\.delete\(/i);
});
