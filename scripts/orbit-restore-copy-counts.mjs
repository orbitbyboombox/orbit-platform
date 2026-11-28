import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

async function counts(filename) {
  const tables = new Map();
  let table;
  const lines = createInterface({ input: createReadStream(filename), crlfDelay: Infinity });
  for await (const line of lines) {
    if (table) {
      if (line === "\\.") table = undefined;
      else tables.set(table, tables.get(table) + 1);
      continue;
    }
    const match = /^COPY ((?:public|auth|storage)\.(?:[a-zA-Z_][a-zA-Z_0-9]*|"[a-zA-Z_][a-zA-Z_0-9]*")) \(.*\) FROM stdin;$/.exec(line);
    if (!match) continue;
    table = match[1];
    if (tables.has(table)) throw new Error(`Repeated COPY block for ${table}`);
    tables.set(table, 0);
  }
  if (table) throw new Error("Unterminated COPY block");
  return tables;
}

const [complete, dataOnly] = process.argv.slice(2);
if (!complete || !dataOnly) throw new Error("Both verified dump paths are required");
const full = await counts(complete);
const secondary = await counts(dataOnly);
for (const table of ["auth.users", "storage.objects", "public.projects", "public.customers", "public.drive_sync"]) {
  if (!full.has(table) || !secondary.has(table)) throw new Error(`Required table missing from the backup: ${table}`);
}
const different = [...new Set([...full.keys(), ...secondary.keys()])]
  .filter(table => full.get(table) !== secondary.get(table));
console.error(JSON.stringify({ authoritativeTables: full.size, secondExportTables: secondary.size, differentCounts: different }));
const checks = [...full].map(([table, expected]) =>
  `if (select count(*) from ${table}) <> ${expected} then raise exception 'Restored row count mismatch: ${table}'; end if;`);
process.stdout.write(`do $orbit_count_check$ begin\n${checks.join("\n")}\nend; $orbit_count_check$;\n`);
process.stdout.write(`select ${full.size} as restored_table_counts_verified;\n`);
