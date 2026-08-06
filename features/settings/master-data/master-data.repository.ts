import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterDataProjection, MasterDataRecord } from "./types";

const money = (value: number | string | null) => value == null ? "Precio por definir" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value));

export async function loadMasterData(client: SupabaseClient): Promise<MasterDataProjection> {
  const [{ data: auth }, entries, prices, staff, equipment] = await Promise.all([
    client.auth.getUser(),
    client.from("master_data_entries").select("id,domain,code,label,enabled,display_order,configuration,version").order("display_order").order("label"),
    client.from("commercial_prices").select("id,category,code,label,duration_hours,destination,unit_price,pricing_status,enabled,display_order,version").is("deleted_at", null).order("category").order("display_order").order("label"),
    client.from("staff").select("id", { count: "exact", head: true }).is("deleted_at", null),
    client.from("operational_assets").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const error = entries.error ?? prices.error ?? staff.error ?? equipment.error;
  if (error) throw error;
  const profile = auth.user ? await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle() : { data: null };
  const role = profile.data?.role ?? "READONLY";
  const records: MasterDataRecord[] = (entries.data ?? []).map((row) => {
    const config = row.configuration as Record<string, unknown>;
    return { id: row.id, domain: row.domain, code: row.code, label: row.label, enabled: row.enabled, displayOrder: row.display_order, version: row.version, description: typeof config.description === "string" ? config.description : undefined, configuration: JSON.stringify(config, null, 2), detail: Object.keys(config).length ? Object.entries(config).map(([key,value]) => `${key}: ${String(value)}`).join(" · ") : "Sin parámetros adicionales" };
  });
  for (const row of prices.data ?? []) {
    const domain = row.category === "SERVICE" ? "OFFICIAL_PRICING" : row.category === "EXTRA" ? "EXTRAS" : "TRANSPORT";
    records.push({ id: row.id, domain, code: row.code, label: row.label, enabled: row.enabled, displayOrder: row.display_order, version: row.version, price: row.unit_price, durationHours: row.duration_hours, detail: row.category === "TRANSPORT" ? `${row.destination ?? row.label} · ${money(row.unit_price)}` : `${row.duration_hours ? `${row.duration_hours} horas · ` : ""}${money(row.unit_price)} · ${row.pricing_status === "DEFINED" ? "Precio oficial" : "Requiere cotización"}` });
  }
  return { canEdit: role === "CEO" || role === "ADMINISTRATOR", role, records, staffCount: staff.count ?? 0, equipmentCount: equipment.count ?? 0 };
}
