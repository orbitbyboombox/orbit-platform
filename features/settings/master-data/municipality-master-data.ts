import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { REGION_METROPOLITANA_COMMUNE_CATALOG } from "@/features/resources/logistics-commune-catalog";

export interface ActiveMunicipality {
  name: string;
  province: string;
  transport: number;
  pricingStatus: "DEFINED" | "REQUIRES_QUOTE";
  transportCode: string;
}

// The selector must expose every RM commune even when its transport tariff is
// not configured yet. Unconfigured communes remain explicitly review-only.
const REGION_METROPOLITANA_COMMUNES = REGION_METROPOLITANA_COMMUNE_CATALOG.map(([name]) => name);

export async function loadActiveMunicipalities(client: SupabaseClient): Promise<ActiveMunicipality[]> {
  const { data, error } = await client
    .from("commercial_prices")
    .select("code,destination,label,unit_price,pricing_status,rules")
    .eq("category", "TRANSPORT")
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("display_order")
    .order("label");
  if (error) throw error;

  const unique = new Map<string, ActiveMunicipality>();
  for (const row of data ?? []) {
    const rules = row.rules && typeof row.rules === "object" ? row.rules as Record<string, unknown> : {};
    const municipalities = Array.isArray(rules.municipalities) ? rules.municipalities : [];
    for (const value of municipalities) {
      if (typeof value !== "string" || !value.trim()) continue;
      const name = value.trim();
      const key = name.toLocaleLowerCase("es-CL");
      if (!unique.has(key)) unique.set(key, {
        name,
        province: String(row.destination ?? row.label),
        transport: Number(row.unit_price ?? 0),
        pricingStatus: row.pricing_status as ActiveMunicipality["pricingStatus"],
        transportCode: row.code,
      });
    }
  }
  return REGION_METROPOLITANA_COMMUNES.map((name) => unique.get(name.toLocaleLowerCase("es-CL")) ?? {
    name,
    province: "Región Metropolitana",
    transport: 0,
    pricingStatus: "REQUIRES_QUOTE" as const,
    transportCode: "UNCONFIGURED",
  }).sort((a, b) => a.name.localeCompare(b.name, "es-CL"));
}
