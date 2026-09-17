import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveMunicipality {
  name: string;
  province: string;
  transport: number;
  pricingStatus: "DEFINED" | "REQUIRES_QUOTE";
  transportCode: string;
}

// The selector must expose every RM commune even when its transport tariff is
// not configured yet. Unconfigured communes remain explicitly review-only.
const REGION_METROPOLITANA_COMMUNES = [
  "Alhué", "Buin", "Calera de Tango", "Cerrillos", "Cerro Navia", "Colina", "Conchalí", "Curacaví", "El Bosque", "El Monte", "Estación Central", "Huechuraba", "Independencia", "Isla de Maipo", "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Lampa", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "María Pinto", "Melipilla", "Ñuñoa", "Padre Hurtado", "Paine", "Pedro Aguirre Cerda", "Peñaflor", "Peñalolén", "Pirque", "Providencia", "Pudahuel", "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Bernardo", "San Joaquín", "San José de Maipo", "San Miguel", "San Pedro", "San Ramón", "Santiago", "Talagante", "Tiltil", "Vitacura",
] as const;

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
