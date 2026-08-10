import { ProjectsPage } from "@/features/projects/components/projects-page";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectsRoute() {
  const client = await createSupabaseServerClient();
  const repository = new SupabaseCustomerRepository(client);
  const [projects, commercialPricesResult, servicesResult, venuesResult] = await Promise.all([
    repository.findAll(),
    client.from("commercial_prices").select("category,code,label,duration_hours,destination,unit_price,pricing_status,rules").eq("enabled", true).is("deleted_at", null),
    client.from("master_data_entries").select("code,label,display_order,configuration").eq("domain", "SERVICES").eq("enabled", true).order("display_order"),
    client.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
  ]);
  if (commercialPricesResult.error) throw commercialPricesResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (venuesResult.error) throw venuesResult.error;
  const commercialPrices = (commercialPricesResult.data ?? []).map((price) => ({
    category: price.category as "SERVICE" | "EXTRA" | "TRANSPORT",
    code: price.code,
    label: price.label,
    durationHours: price.duration_hours,
    destination: price.destination,
    unitPrice: price.unit_price == null ? null : Number(price.unit_price),
    pricingStatus: price.pricing_status as "DEFINED" | "REQUIRES_QUOTE",
    rules: (price.rules ?? {}) as Record<string, unknown>,
  }));
  const configuration = (venuesResult.data?.configuration ?? {}) as { venues?: Array<{ name?: unknown; municipality?: unknown; province?: unknown; surcharge?: unknown }> };
  const venues = (configuration.venues ?? []).flatMap((venue) => typeof venue.name === "string" && typeof venue.municipality === "string" && typeof venue.province === "string" ? [{ name: venue.name, municipality: venue.municipality, province: venue.province, surcharge: Number(venue.surcharge ?? 0) }] : []);
  const services = (servicesResult.data ?? []).map((service) => {
    const config = (service.configuration ?? {}) as Record<string, unknown>;
    const basePrice = commercialPrices.find((price) => price.category === "SERVICE" && price.code === service.code);
    const extras = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return {
      code: service.code,
      name: service.label,
      displayOrder: service.display_order,
      minimumHours: Number(config.minimumHours ?? config.defaultDuration ?? basePrice?.durationHours ?? 2),
      maximumHours: Number(config.maximumHours ?? config.minimumHours ?? config.defaultDuration ?? basePrice?.durationHours ?? 4),
      additionalHourPrice: config.additionalHourPrice == null ? Number(basePrice?.rules?.additionalHourPrice ?? 0) : Number(config.additionalHourPrice),
      compatibleExtras: extras(config.compatibleExtras ?? basePrice?.rules?.compatibleExtras),
      defaultExtras: extras(config.defaultExtras ?? basePrice?.rules?.defaultExtras),
      behavior: String(config.behavior ?? basePrice?.rules?.behavior ?? "SELECTABLE"),
    };
  });
  return <ProjectsPage commercialPrices={commercialPrices} initialProjects={projects} services={services} venues={venues} />;
}
