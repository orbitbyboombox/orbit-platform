import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestPath, storageRoot] = process.argv.slice(2);
if (!manifestPath || !storageRoot) throw new Error("Usage: validate-storage-restore.mjs <manifest> <restored-storage-root>");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedCounts = manifest.expectedCounts;
if (!expectedCounts || typeof expectedCounts !== "object" || Array.isArray(expectedCounts) || !Object.keys(expectedCounts).length) throw new Error("Storage restore manifest is missing bucket counts");
for (const [name, count] of Object.entries(expectedCounts)) if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid Storage count for ${name}`);
const expectedTotal = Object.values(expectedCounts).reduce((sum, count) => sum + count, 0);
const counts = Object.fromEntries(Object.keys(expectedCounts).map((name) => [name, 0]));
const seen = new Set();
let total = 0;
for (const bucket of manifest.buckets ?? []) {
  if (!Object.hasOwn(expectedCounts, bucket.name)) throw new Error(`Unexpected Storage bucket in manifest: ${bucket.name}`);
  for (const object of bucket.objects ?? []) {
    const key = `${bucket.name}/${object.path}`;
    if (seen.has(key)) throw new Error(`Duplicate Storage object in manifest: ${key}`);
    seen.add(key);
    const parts = object.path.split("/");
    if (!object.path || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) throw new Error(`Unsafe object path in restore manifest: ${bucket.name}`);
    const filePath = resolve(storageRoot, bucket.name, ...parts);
    if (!filePath.startsWith(resolve(storageRoot) + "/")) throw new Error("Restored file escaped Storage root");
    const bytes = await readFile(filePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== object.size || sha256 !== object.sha256) throw new Error(`Storage checksum mismatch: ${bucket.name}/${object.path}`);
    total += 1;
    if (Object.hasOwn(counts, bucket.name)) counts[bucket.name] += 1;
  }
}
for (const [name, expected] of Object.entries(expectedCounts)) if (counts[name] !== expected) throw new Error(`Storage restore count mismatch for ${name}: expected ${expected}, got ${counts[name]}`);
if (total !== expectedTotal || total === 0) throw new Error(`Storage restore is incomplete: expected ${expectedTotal}, got ${total}`);
console.log(JSON.stringify({ verifiedObjects: total, expectedBuckets: counts, sha256: "PASS" }));
