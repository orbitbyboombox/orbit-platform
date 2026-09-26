import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Events mobile row keeps the reference agenda geometry", async () => {
  const source = await readFile("features/crm/event-center.tsx", "utf8");

  assert.match(source, /grid-cols-\[48px_4px_minmax\(0,1fr\)_16px\]/);
  assert.match(source, /md:hidden/);
  assert.match(source, /h-14 w-1 self-center rounded-full/);
  assert.match(source, /grid size-7 place-items-center/);
  assert.match(source, /min-h-\[92px\]/);
  assert.match(source, /overflow-x-clip/);
  assert.match(source, /md:grid-cols-\[72px_minmax\(0,1fr\)_auto\]/);
});
