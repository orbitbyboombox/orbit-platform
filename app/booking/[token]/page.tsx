import { notFound } from "next/navigation";
import { AutomaticBookingExperience } from "@/features/automatic-booking/automatic-booking-experience";
import { loadAutomaticBookingInvitation } from "@/features/automatic-booking/automatic-booking.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";
import { loadModuleStates } from "@/features/module-manager/repository";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";

export const dynamic = "force-dynamic";

export default async function AutomaticBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const modules = await loadModuleStates(admin);
  if (!modules.BOOKING_EXPERIENCE) notFound();
  const invitation = await loadAutomaticBookingInvitation(token);
  if (!invitation) notFound();
  const [servicesResult, pricesResult, venuesResult, municipalities, company] = await Promise.all([
    admin.from("master_data_entries").select("code,label,configuration").eq("domain", "SERVICES").eq("enabled", true).order("display_order"),
    admin.from("commercial_prices").select("category,code,duration_hours,destination,unit_price,rules").eq("enabled", true).is("deleted_at", null),
    admin.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
    loadActiveMunicipalities(admin),
    loadCompanySettings(admin),
  ]);
  if (servicesResult.error || pricesResult.error || venuesResult.error) throw servicesResult.error ?? pricesResult.error ?? venuesResult.error;
  const venuesConfig = (venuesResult.data?.configuration ?? {}) as { venues?: Array<Record<string, unknown>> };
  const prices = (pricesResult.data ?? []).map((item) => ({ ...item, unit_price: Number(item.unit_price ?? 0), duration_hours: item.duration_hours == null ? null : Number(item.duration_hours), rules: (item.rules ?? {}) as Record<string, unknown> }));
  const services = (servicesResult.data ?? []).map((item) => {
    const configuration = (item.configuration ?? {}) as Record<string, unknown>;
    const pricedHours = prices.filter((price) => price.category === "SERVICE" && price.code === item.code && price.duration_hours !== null).map((price) => Number(price.duration_hours));
    const minimum = Number(configuration.minimumHours ?? configuration.defaultDuration ?? 2);
    const maximum = Number(configuration.maximumHours ?? minimum);
    const configuredHours = Array.from({ length: Math.max(1, maximum - minimum + 1) }, (_, index) => minimum + index);
    return { code: item.code, name: item.label, configuration, description: typeof configuration.description === "string" ? configuration.description : undefined, availableHours: Array.from(new Set(pricedHours.length ? pricedHours : configuredHours)).sort((a, b) => a - b) };
  });
  const venues = (venuesConfig.venues ?? []).filter((item) => typeof item.name === "string" && (item.enabled ?? true) !== false).map((item) => ({ name: String(item.name), municipality: String(item.municipality ?? ""), province: String(item.province ?? ""), aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string") : [], explanation: typeof item.explanation === "string" ? item.explanation : undefined, surcharge: Number(item.surcharge ?? 0) }));
  return <AutomaticBookingExperience bankDetails={resolveCollectionBankDetails(company)} email={invitation.customer_email} municipalities={municipalities} prices={prices} services={services} token={token} venues={venues}/>;
}
