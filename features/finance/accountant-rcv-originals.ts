import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSiiRcvFilename } from "./sii-rcv";
import { siiCompanyRut } from "./sii-rcv-report";

export async function loadAccountantRcvOriginals(period: string) {
  const { data, count, error } = await createAdminClient().from("sii_rcv_imports" as never)
    .select("source_name,source_bytes,source_hash,register", { count: "exact" })
    .eq("company_rut", siiCompanyRut).eq("period", `${period}-01`);
  const imports = (data ?? []) as { source_name: string; source_bytes: string; source_hash: string; register: string }[];
  if (error || count === null || count !== imports.length) throw new Error("No se pudieron verificar los CSV originales del SII.");

  const files = new Map<string, Uint8Array>();
  for (const row of imports) {
    const info = readSiiRcvFilename(row.source_name);
    if (info.period !== period || info.kind !== row.register || !/^\\x(?:[0-9a-f]{2})+$/i.test(row.source_bytes)) {
      throw new Error("El original RCV tiene un período, registro o formato distinto.");
    }
    const bytes = Buffer.from(row.source_bytes.slice(2), "hex");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== row.source_hash) throw new Error("La huella SHA-256 del CSV original no coincide.");
    files.set(`RCV-originales/${info.kind}/${checksum}/${row.source_name}`, bytes);
  }
  return files;
}
