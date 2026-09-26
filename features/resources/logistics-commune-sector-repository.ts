import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultSectorForCommune,
  isLogisticsSector,
  normalizeCommune,
  REGION_METROPOLITANA_COMMUNE_CATALOG,
  type CommuneSectorMapping,
} from "./logistics-commune-catalog";

export async function loadLogisticsCommuneSectorMappings(client: SupabaseClient): Promise<CommuneSectorMapping[]> {
  const { data, error } = await client
    .from("master_data_entries")
    .select("code,label,configuration")
    .eq("domain", "LOGISTICS_COMMUNE_SECTOR")
    .eq("enabled", true)
    .order("display_order");
  if (error) throw error;

  const persisted = new Map((data ?? []).map((row) => {
    const configuration = row.configuration && typeof row.configuration === "object" ? row.configuration as Record<string, unknown> : {};
    return [normalizeCommune(String(configuration.communeNormalized ?? row.label)), configuration] as const;
  }));
  return REGION_METROPOLITANA_COMMUNE_CATALOG.map(([commune, province]) => {
    const configuration = persisted.get(normalizeCommune(commune));
    return {
      commune,
      province,
      region: "REGION_METROPOLITANA" as const,
      sector: isLogisticsSector(configuration?.sector) ? configuration.sector : defaultSectorForCommune(commune),
      source: isLogisticsSector(configuration?.sector) ? "PERSISTED" as const : "DEFAULT" as const,
    };
  });
}

