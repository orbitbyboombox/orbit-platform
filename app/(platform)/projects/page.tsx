import { ProjectsPage } from "@/features/projects/components/projects-page";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectsRoute() {
  const client = await createSupabaseServerClient();
  const repository = new SupabaseCustomerRepository(client);
  const [projects, commercialPricesResult] = await Promise.all([
    repository.findAll(),
    client.from("commercial_prices").select("category,code,label,duration_hours,destination,unit_price,pricing_status,rules").eq("enabled", true).is("deleted_at", null),
  ]);
  if (commercialPricesResult.error) throw commercialPricesResult.error;
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
  return <ProjectsPage commercialPrices={commercialPrices} initialProjects={projects} />;
}
