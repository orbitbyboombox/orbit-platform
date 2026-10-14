import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const [, , outputRoot, manifestPath] = process.argv;
if (!outputRoot || !manifestPath) throw new Error("Usage: export-supabase-storage.mjs <output> <manifest>");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Storage credentials are required as protected environment variables");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = { generatedAt: new Date().toISOString(), buckets: [] };
const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;

for (const bucket of buckets ?? []) {
  const entries = [];
  const pendingPrefixes = [""];
  while (pendingPrefixes.length) {
    const prefix = pendingPrefixes.shift();
    const { data, error } = await supabase.storage.from(bucket.name).list(prefix, { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Storage list failed for ${bucket.name}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) {
        pendingPrefixes.push(relative);
        continue;
      }
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket.name).download(relative);
      if (downloadError) throw new Error(`Storage download failed for ${bucket.name}/${relative}: ${downloadError.message}`);
      const bytes = Buffer.from(await blob.arrayBuffer());
      const target = normalize(join(outputRoot, bucket.name, relative));
      if (!target.startsWith(normalize(join(outputRoot, bucket.name)))) throw new Error("Unsafe Storage path");
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
      entries.push({ path: relative, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: item.metadata?.mimetype ?? null, updatedAt: item.updated_at ?? null });
    }
  }
  manifest.buckets.push({ name: bucket.name, public: bucket.public, objects: entries });
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
