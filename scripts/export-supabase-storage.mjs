import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertInventoryStable, assertSafeOutputPath, paginateList } from "./backup-integrity.mjs";

const [, , outputRoot, manifestPath] = process.argv;
if (!outputRoot || !manifestPath) throw new Error("Usage: export-supabase-storage.mjs <output> <manifest>");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Storage credentials are required as protected environment variables");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = { generatedAt: new Date().toISOString(), buckets: [] };
const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;

async function withRetry(operation, label) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw new Error(`${label} failed after retries: ${lastError?.message ?? lastError}`);
}

async function listObjects(bucketName) {
  const objects = [];
  const pendingPrefixes = [""];
  while (pendingPrefixes.length) {
    const prefix = pendingPrefixes.shift();
    const pages = await paginateList(async (offset) => {
      const { data, error } = await withRetry(
        () => supabase.storage.from(bucketName).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
        `Storage list ${bucketName}/${prefix}/${offset}`,
      );
      if (error) throw error;
      return data ?? [];
    });
    for (const item of pages) {
        const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id == null) pendingPrefixes.push(objectPath);
        else objects.push({ path: objectPath, size: item.metadata?.size ?? null, etag: item.metadata?.eTag ?? null, updatedAt: item.updated_at ?? null, mimeType: item.metadata?.mimetype ?? null });
    }
  }
  return objects;
}

for (const bucket of buckets ?? []) {
  const listedBefore = await listObjects(bucket.name);
  const entries = [];
  for (const item of listedBefore) {
    const { data: blob, error: downloadError } = await withRetry(() => supabase.storage.from(bucket.name).download(item.path), `Storage download ${bucket.name}/${item.path}`);
    if (downloadError) throw new Error(`Storage download failed for ${bucket.name}/${item.path}: ${downloadError.message}`);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const target = assertSafeOutputPath(outputRoot, bucket.name, item.path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    entries.push({ path: item.path, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: item.mimeType, updatedAt: item.updatedAt, etag: item.etag });
  }
  const listedAfter = await listObjects(bucket.name);
  assertInventoryStable(listedBefore, listedAfter);
  manifest.buckets.push({ name: bucket.name, public: bucket.public, objects: entries });
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
