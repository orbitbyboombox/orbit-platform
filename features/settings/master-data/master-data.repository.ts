import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostMasterCategory, MasterDataProjection, MasterDataRecord, ServiceAdministrationRecord, ServiceExtraCode, TransportZoneAdministrationRecord, VenueAdministrationRecord } from "./types";

const money = (value: number | string | null) => value == null ? "Precio por definir" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value));

export async function loadMasterData(client: SupabaseClient): Promise<MasterDataProjection> {
  const [{ data: auth }, entries, prices, staff, equipment, costs] = await Promise.all([
    client.auth.getUser(),
    client.from("master_data_entries").select("id,domain,code,label,enabled,display_order,configuration,version").order("display_order").order("label"),
    client.from("commercial_prices").select("id,category,code,label,duration_hours,destination,unit_price,pricing_status,enabled,display_order,rules,version").is("deleted_at", null).order("category").order("display_order").order("label"),
    client.from("staff").select("id", { count: "exact", head: true }).is("deleted_at", null),
    client.from("operational_assets").select("id", { count: "exact", head: true }).is("deleted_at", null),
    client.from("cost_master_entries").select("id,category,code,label,amount,quantity,unit,enabled,display_order,version,updated_at,metadata").is("deleted_at",null).order("display_order").order("label"),
  ]);
  const error = entries.error ?? prices.error ?? staff.error ?? equipment.error ?? costs.error;
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
      additionalHourPrice: config.additionalHourPrice == null ? (base?.rules as Record<string,unknown>|null)?.additionalHourPrice == null ? null : Number((base?.rules as Record<string,unknown>).additionalHourPrice) : Number(config.additionalHourPrice),
      estimatedPhotosPerHour: config.estimatedPhotosPerHour == null ? null : Number(config.estimatedPhotosPerHour),
      paperConsumption: config.paperConsumption == null ? null : Number(config.paperConsumption),
      enabled: row.enabled && serviceRows.every((price) => price.enabled), displayOrder: row.display_order,
      description: String(config.description ?? ""), compatibleExtras: extras(config.compatibleExtras ?? (base?.rules as Record<string,unknown>|null)?.compatibleExtras), defaultExtras: extras(config.defaultExtras ?? (base?.rules as Record<string,unknown>|null)?.defaultExtras),
      behavior: String(config.behavior ?? (base?.rules as Record<string,unknown>|null)?.behavior ?? "SELECTABLE"), version: row.version, priceVersion: base?.version ?? null,
    };
  });
  const venueMaster = (entries.data ?? []).find((row) => row.domain === "SYSTEM_PARAMETERS" && row.code === "EVENT_VENUES") ?? null;
  const venueConfiguration = (venueMaster?.configuration ?? {}) as { venues?: unknown };
  const venues: VenueAdministrationRecord[] = Array.isArray(venueConfiguration.venues) ? venueConfiguration.venues.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const venue = value as Record<string, unknown>;
    if (typeof venue.name !== "string" || typeof venue.municipality !== "string" || typeof venue.province !== "string") return [];
    const code = typeof venue.code === "string" ? venue.code : venue.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return [{ code, name: venue.name, municipality: venue.municipality, province: venue.province, surcharge: Number(venue.surcharge ?? 0), notes: typeof venue.notes === "string" ? venue.notes : "", enabled: venue.enabled !== false, displayOrder: Number(venue.displayOrder ?? (index + 1) * 10) }];
  }) : [];
  const transportZones: TransportZoneAdministrationRecord[] = (prices.data ?? []).filter((row) => row.category === "TRANSPORT").map((row) => {
    const rules = (row.rules ?? {}) as Record<string, unknown>;
    const municipalities = Array.isArray(rules.municipalities) ? rules.municipalities.filter((item): item is string => typeof item === "string") : [];
    return { id:row.id, code:row.code, province:row.destination ?? row.label, transportValue:row.unit_price == null ? null : Number(row.unit_price), enabled:row.enabled, displayOrder:row.display_order, municipalities, version:row.version };
  });
  const costMaster = (costs.data ?? []).map((row) => ({ id:row.id, category:row.category as CostMasterCategory, code:row.code, label:row.label, amount:row.amount == null ? null : Number(row.amount), quantity:row.quantity == null ? null : Number(row.quantity), unit:row.unit, enabled:row.enabled, displayOrder:row.display_order, version:row.version, updatedAt:row.updated_at, description:typeof row.metadata?.description==="string"?row.metadata.description:"" }));
  return { canEdit: role === "CEO" || role === "ADMINISTRATOR", role, records, services, transportZones, costMaster, venues: { masterId: venueMaster?.id ?? null, version: venueMaster?.version ?? null, records: venues.sort((a,b) => a.displayOrder - b.displayOrder) }, staffCount: staff.count ?? 0, equipmentCount: equipment.count ?? 0 };
}
