import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Events mobile row keeps the reference agenda geometry", async () => {
  const source = await readFile("features/crm/event-center.tsx", "utf8");

  assert.match(source, /grid-cols-\[38px_3px_54px_72px_68px_55px_43px_14px\]/);
  assert.match(source, /md:hidden/);
  assert.match(source, /h-12 w-1 self-center rounded-full/);
  assert.match(source, /grid size-7 place-items-center/);
  assert.match(source, /min-h-\[72px\]/);
  assert.match(source, /overflow-x-clip/);
  assert.match(source, /md:grid-cols-\[72px_minmax\(0,1fr\)_auto\]/);
});
