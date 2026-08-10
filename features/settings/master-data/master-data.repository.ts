import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterDataProjection, MasterDataRecord, ServiceAdministrationRecord, ServiceExtraCode } from "./types";

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
  const servicePrices = (prices.data ?? []).filter((row) => row.category === "SERVICE");
  const services: ServiceAdministrationRecord[] = (entries.data ?? []).filter((row) => row.domain === "SERVICES").map((row) => {
    const config = (row.configuration ?? {}) as Record<string, unknown>;
    const serviceRows = servicePrices.filter((price) => price.code === row.code).sort((a,b) => Number(a.duration_hours ?? 0) - Number(b.duration_hours ?? 0));
    const base = serviceRows.find((price) => Number(price.duration_hours ?? config.minimumHours ?? config.defaultDuration ?? 2) === Number(config.minimumHours ?? config.defaultDuration ?? 2)) ?? serviceRows[0];
    const extras = (value: unknown): ServiceExtraCode[] => Array.isArray(value) ? value.filter((item): item is ServiceExtraCode => ["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"].includes(String(item))) : [];
    return {
      id: row.id, priceId: base?.id ?? null, code: row.code, name: row.label,
      category: String(config.category ?? config.defaultCategory ?? "Experiencia"),
      basePrice: base?.unit_price == null ? null : Number(base.unit_price),
      minimumHours: Number(config.minimumHours ?? config.defaultDuration ?? base?.duration_hours ?? 2),
      maximumHours: Number(config.maximumHours ?? config.minimumHours ?? config.defaultDuration ?? base?.duration_hours ?? 4),
      additionalHourPrice: config.additionalHourPrice == null ? null : Number(config.additionalHourPrice),
      enabled: row.enabled && serviceRows.every((price) => price.enabled), displayOrder: row.display_order,
      description: String(config.description ?? ""), compatibleExtras: extras(config.compatibleExtras), defaultExtras: extras(config.defaultExtras),
      behavior: String(config.behavior ?? "SELECTABLE"), version: row.version, priceVersion: base?.version ?? null,
    };
  });
  return { canEdit: role === "CEO" || role === "ADMINISTRATOR", role, records, services, staffCount: staff.count ?? 0, equipmentCount: equipment.count ?? 0 };
}
