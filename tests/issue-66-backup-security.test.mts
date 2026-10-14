import test from "node:test";
import assert from "node:assert/strict";
import { assertInventoryStable, assertReadback, assertSafeOutputPath, paginateList } from "../scripts/backup-integrity.mjs";

test("rejects traversal and prefix-confusion paths", () => {
  assert.throws(() => assertSafeOutputPath("/tmp/root", "bucket", "../escape.txt"));
  assert.throws(() => assertSafeOutputPath("/tmp/root", "bucket", "a/../../escape.txt"));
  assert.throws(() => assertSafeOutputPath("/tmp/root", "../bucket", "x"), /Unsafe bucket/);
  assert.doesNotThrow(() => assertSafeOutputPath("/tmp/root", "bucket", "a/b.txt"));
});

test("detects inventory changes after paginated export", () => {
  const before = Array.from({ length: 1001 }, (_, index) => ({ path: `file-${index}`, size: 1, updatedAt: "same" }));
  assert.doesNotThrow(() => assertInventoryStable(before, [...before]));
  assert.throws(() => assertInventoryStable(before, before.slice(0, 1000)), /inventory changed/);
  assert.throws(() => assertInventoryStable(before, before.map((item, index) => index === 1000 ? { ...item, updatedAt: "changed" } : item)), /object changed/);
});

test("paginates more than 1000 Storage entries", async () => {
  const offsets: number[] = [];
  const result = await paginateList(async (offset: number): Promise<number[]> => {
    offsets.push(offset);
    if (offset === 0) return Array.from({ length: 1000 }, (_, index) => index);
    return [1000];
  });
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(result.length, 1001);
});

test("fails on Drive readback size or SHA mismatch", () => {
  assert.doesNotThrow(() => assertReadback({ size: 4, sha256: "abc" }, { size: 4, sha256: "abc" }, "artifact.enc"));
  assert.throws(() => assertReadback({ size: 4, sha256: "abc" }, { size: 5, sha256: "abc" }, "artifact.enc"), /integrity mismatch/);
  assert.throws(() => assertReadback({ size: 4, sha256: "abc" }, { size: 4, sha256: "def" }, "artifact.enc"), /integrity mismatch/);
});
