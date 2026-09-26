"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canonicalCommuneName,
  isLogisticsSector,
  normalizeCommune,
  REGION_METROPOLITANA_COMMUNE_CATALOG,
  type LogisticsSector,
} from "./logistics-commune-catalog";

export async function updateCommuneSectorAction(input: { commune: string; sector: LogisticsSector }) {
  if (!isLogisticsSector(input.sector)) return { ok: false, error: "Sector inválido" };
  const commune = canonicalCommuneName(input.commune);
  const catalogEntry = REGION_METROPOLITANA_COMMUNE_CATALOG.find(([name]) => normalizeCommune(name) === normalizeCommune(commune));
  if (!catalogEntry) return { ok: false, error: "Comuna no pertenece al catálogo RM" };
  const client = await createSupabaseServerClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return { ok: false, error: "Sesión requerida" };
  const code = normalizeCommune(catalogEntry[0]);
  const { data: current, error: readError } = await client.from("master_data_entries").select("id,configuration").eq("domain", "LOGISTICS_COMMUNE_SECTOR").eq("code", code).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const configuration = current?.configuration && typeof current.configuration === "object" ? current.configuration as Record<string, unknown> : {};
  const nextConfiguration = { ...configuration, communeNormalized: code, province: catalogEntry[1], region: "REGION_METROPOLITANA", sector: input.sector };
  const payload = { configuration: nextConfiguration, updated_by: userData.user.id, approval_reason: "Founder actualizó el mapping comuna → sector" };
  const result = current
    ? await client.from("master_data_entries").update(payload).eq("id", current.id)
    : await client.from("master_data_entries").insert({ domain: "LOGISTICS_COMMUNE_SECTOR", code, label: catalogEntry[0], display_order: REGION_METROPOLITANA_COMMUNE_CATALOG.findIndex(([name]) => name === catalogEntry[0]), created_by: userData.user.id, ...payload });
  if (result.error) return { ok: false, error: result.error.message };
  revalidatePath("/resources/staff");
  return { ok: true, commune: catalogEntry[0], sector: input.sector };
}
