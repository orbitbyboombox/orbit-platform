import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path: string) =>
  readFile(new URL(path, root), "utf8");

test("event financial summary remains resilient at zoomed desktop widths", async () => {
  const file = await source(
    "features/projects/components/project-workspace-experience.tsx",
  );

  assert.match(file, /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5/);
  assert.match(file, /xl:grid-cols-1 2xl:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(520px,0\.9fr\)\]/);
  assert.match(file, /text-\[clamp\(1rem,1\.8vw,1\.5rem\)\]/);
  assert.doesNotMatch(file, /\[overflow-wrap:anywhere\]/);
  assert.match(file, /whitespace-nowrap text-\[clamp\(1rem,1\.8vw,1\.5rem\)\]/);
});

test("event documents keep filenames readable instead of splitting characters", async () => {
  const file = await source("features/photo-strip-design/photo-strip-design-center.tsx");

  assert.doesNotMatch(file, /break-all/);
  assert.match(file, /overflow-hidden text-ellipsis whitespace-nowrap[^>]*title=\{current\.originalFilename\}/);
  assert.match(file, /sm:grid-cols-\[auto_minmax\(0,1fr\)\]/);
});

test("shared SmartCard prevents value and header overflow", async () => {
  const file = await source("components/cards/smart-card.tsx");

  assert.match(file, /orbit-enter min-w-0/);
  assert.match(file, /flex min-w-0 flex-wrap items-start/);
  assert.match(file, /break-words text-\[clamp\(1\.25rem,2vw,1\.875rem\)\]/);
  assert.match(file, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(file, /<h3 className="truncate/);
});

test("dense KPI panels defer wide column counts until large viewports", async () => {
  const files = await Promise.all([
    source("features/accounts-payable/accounts-payable-center.tsx"),
    source("features/accounts-receivable/accounts-receivable-center.tsx"),
    source("features/staff-payments/staff-payments-center.tsx"),
  ]);

  for (const file of files) {
    assert.match(file, /min-w-0/);
    assert.match(file, /2xl:grid-cols-7/);
  }
});
