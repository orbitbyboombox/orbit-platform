import { notFound } from "next/navigation";
import { AutomaticBookingExperience } from "@/features/automatic-booking/automatic-booking-experience";
import { loadAutomaticBookingInvitation } from "@/features/automatic-booking/automatic-booking.service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AutomaticBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await loadAutomaticBookingInvitation(token);
  if (!invitation) notFound();
  const admin = createAdminClient();
  const [servicesResult, pricesResult, venuesResult] = await Promise.all([
    admin.from("master_data_entries").select("code,label,configuration").eq("domain", "SERVICES").eq("enabled", true).order("display_order"),
    admin.from("commercial_prices").select("category,code,duration_hours,unit_price,rules").eq("enabled", true).is("deleted_at", null),
    admin.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
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
    return { code: item.code, name: item.label, configuration, availableHours: Array.from(new Set(pricedHours.length ? pricedHours : configuredHours)).sort((a, b) => a - b) };
  });
  const venues = (venuesConfig.venues ?? []).filter((item) => typeof item.name === "string" && (item.enabled ?? true) !== false).map((item) => ({ name: String(item.name), municipality: String(item.municipality ?? ""), province: String(item.province ?? "") }));
  return <AutomaticBookingExperience email={invitation.customer_email} prices={prices} services={services} token={token} venues={venues}/>;
}
