import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [, , directory, commit] = process.argv;
const storage = JSON.parse(await readFile(join(directory, "storage-manifest.json"), "utf8"));
const manifest = {
  format: 1,
  kind: "supabase-storage-only",
  createdAt: new Date().toISOString(),
  commit,
  storage: { archive: "storage.tar.gz.enc", inventory: storage },
  checksums: "sha256sums.txt.enc",
};
await writeFile(join(directory, "storage-backup-manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
