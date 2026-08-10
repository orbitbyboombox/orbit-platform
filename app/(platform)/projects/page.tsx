import { ProjectsPage } from "@/features/projects/components/projects-page";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectsRoute() {
  const client = await createSupabaseServerClient();
  const repository = new SupabaseCustomerRepository(client);
  const [projects, commercialPricesResult, venuesResult] = await Promise.all([
    repository.findAll(),
    client.from("commercial_prices").select("category,code,label,duration_hours,destination,unit_price,pricing_status,rules").eq("enabled", true).is("deleted_at", null),
    client.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
  ]);
  if (commercialPricesResult.error) throw commercialPricesResult.error;
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
  return <ProjectsPage commercialPrices={commercialPrices} initialProjects={projects} venues={venues} />;
}
