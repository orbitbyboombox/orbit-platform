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
  const services = (servicesResult.data ?? []).map((item) => ({ code: item.code, name: item.label, configuration: (item.configuration ?? {}) as Record<string, unknown> }));
  const prices = (pricesResult.data ?? []).map((item) => ({ ...item, unit_price: Number(item.unit_price ?? 0), duration_hours: item.duration_hours == null ? null : Number(item.duration_hours), rules: (item.rules ?? {}) as Record<string, unknown> }));
  const venues = (venuesConfig.venues ?? []).filter((item) => typeof item.name === "string" && (item.enabled ?? true) !== false).map((item) => ({ name: String(item.name), municipality: String(item.municipality ?? ""), province: String(item.province ?? "") }));
  return <AutomaticBookingExperience email={invitation.customer_email} prices={prices} services={services} token={token} venues={venues}/>;
}
