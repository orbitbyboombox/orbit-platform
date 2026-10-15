import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

export function assertSafeStoragePath(bucket, objectPath) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bucket)) throw new Error("Unsafe bucket name");
  const parts = objectPath.split("/");
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
    throw new Error("Unsafe Storage object path");
  }
  return parts;
}

export function assertSafeOutputPath(root, bucket, objectPath) {
  const parts = assertSafeStoragePath(bucket, objectPath);
  const bucketRoot = resolve(root, bucket);
  const target = resolve(bucketRoot, ...parts);
  const rel = relative(bucketRoot, target);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) throw new Error("Storage path escaped output root");
  return target;
}

export function inventorySignature(entries) {
  return new Map(entries.map((entry) => [entry.path, `${entry.updatedAt ?? ""}|${entry.size ?? ""}|${entry.etag ?? ""}`]));
}

export async function paginateList(fetchPage, pageSize = 1000) {
  const pages = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset);
    pages.push(page);
    if (page.length < pageSize) return pages.flat();
  }
}

export function assertInventoryStable(before, after) {
  const left = inventorySignature(before);
  const right = inventorySignature(after);
  if (left.size !== right.size) throw new Error("Storage inventory changed during export");
  for (const [path, signature] of left) if (right.get(path) !== signature) throw new Error(`Storage object changed during export: ${path}`);
}

export async function hashFile(filePath) {
  const bytes = await stat(filePath);
  const hash = createHash("sha256");
  const { createReadStream } = await import("node:fs");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { size: bytes.size, sha256: hash.digest("hex") };
}

export function assertReadback(expected, actual, name) {
  if (!actual || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`Drive integrity mismatch: ${name}`);
}
