import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestPath, storageRoot] = process.argv.slice(2);
if (!manifestPath || !storageRoot) throw new Error("Usage: validate-storage-restore.mjs <manifest> <restored-storage-root>");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedCounts = { "orbit-documents": 430, "orbit-signatures": 43, "orbit-expenses": 21, "orbit-academy": 2, "orbit-branding": 1 };
const expectedTotal = Object.values(expectedCounts).reduce((sum, count) => sum + count, 0);
const counts = Object.fromEntries(Object.keys(expectedCounts).map((name) => [name, 0]));
let total = 0;
for (const bucket of manifest.buckets ?? []) {
  for (const object of bucket.objects ?? []) {
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
if (total < expectedTotal) throw new Error(`Storage restore is incomplete: expected at least ${expectedTotal}, got ${total}`);
console.log(JSON.stringify({ verifiedObjects: total, expectedBuckets: counts, sha256: "PASS" }));
