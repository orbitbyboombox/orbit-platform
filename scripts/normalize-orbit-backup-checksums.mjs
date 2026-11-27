import { readFileSync } from "node:fs";
import { posix } from "node:path";

const required = new Set([
  "backup-manifest.json.enc",
  "database-data.sql.enc",
  "database-schema.sql.enc",
  "source-code.tar.gz.enc",
  "storage-manifest.json.enc",
  "storage.tar.gz.enc",
]);
const manifest = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/);
const normalized = manifest.map(line => {
  const match = /^([a-f\d]{64}) [ *](\S+)$/i.exec(line);
  if (!match) throw new Error("Invalid checksum manifest line");
  const name = posix.basename(match[2]);
  if (!required.delete(name)) throw new Error("Unexpected or repeated encrypted artifact");
  return `${match[1]}  ${name}`;
});
if (required.size) throw new Error("Missing encrypted artifact checksum");
process.stdout.write(normalized.join("\n") + "\n");
