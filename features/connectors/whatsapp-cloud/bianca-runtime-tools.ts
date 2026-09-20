import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveServicePrice, ServicePriceUnavailableError } from "@/features/automatic-booking/service-pricing";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";
import { resolveCanonicalVenue, type CanonicalVenue } from "@/features/settings/master-data/venue-resolution";

export type BiancaPriceLookupResult =
  | { status: "RESOLVED"; lines: Array<{ serviceCode: string; amount: number; pricingMode: "FIXED" | "DURATION"; hours: number | null }>; transport: number; venueSurcharge: number; total: number }
  | { status: "MISSING_DURATION"; serviceCodes: string[] }
  | { status: "QUOTE_REQUIRED"; serviceCodes: string[] }
  | { status: "ERROR"; code: "PRICE_LOOKUP_FAILED" };

export type BiancaAvailabilityLookupResult =
  | { status: "AVAILABLE" | "UNAVAILABLE" }
  | { status: "INSUFFICIENT_DATA"; missing: string[] }
  | { status: "TECHNICAL_ERROR"; code: "AVAILABILITY_LOOKUP_FAILED" };

const SERVICE_ALIASES: Record<string, string> = {
  classic: "CLASSIC", polaroid: "POLAROID", "black studio": "BLACK_STUDIO", bbox360: "BBOX360",
  lightbox: "LIGHTBOX", boomball: "BOOMBALL", hashtag: "HASHTAG", instabox: "INSTABOX", "video lounge": "VIDEO_LOUNGE",
};

export function inferServiceCodes(text: string, known: readonly string[] = []) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const result = new Set(known.map((code) => code.toUpperCase()));
  for (const [alias, code] of Object.entries(SERVICE_ALIASES)) if (normalized.includes(alias)) result.add(code);
  return [...result];
}

function inferDuration(text: string, known?: number) {
  if (known && Number.isFinite(known)) return known;
  const match = text.match(/\b([1-9]|1[0-2])\s*(?:h|hrs?|horas?)\b/i);
  return match ? Number(match[1]) : undefined;
}

export async function lookupBiancaPrice(client: SupabaseClient, input: { text: string; serviceCodes?: readonly string[]; durationHours?: number; commune?: string; specialVenue?: string }): Promise<BiancaPriceLookupResult> {
  const serviceCodes = inferServiceCodes(input.text, input.serviceCodes);
  if (!serviceCodes.length) return { status: "QUOTE_REQUIRED", serviceCodes: [] };
  const duration = inferDuration(input.text, input.durationHours);
  try {
    const [{ data: rows, error }, municipalities, venuesResult] = await Promise.all([
      client.from("commercial_prices").select("category,code,duration_hours,unit_price,rules,pricing_status").eq("category", "SERVICE").in("code", serviceCodes).eq("enabled", true).is("deleted_at", null),
      input.commune ? loadActiveMunicipalities(client) : Promise.resolve([]),
      client.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
    ]);
    if (error) return { status: "ERROR", code: "PRICE_LOOKUP_FAILED" };
    const fixedCodes = new Set((rows ?? [])
      .filter((row) => (row.rules as Record<string, unknown> | null)?.fixed === true)
      .map((row) => row.code));
    const durationNeeded = serviceCodes.filter((code) => (rows ?? []).some((row) => row.code === code) && !fixedCodes.has(code));
    if (durationNeeded.length && !duration) return { status: "MISSING_DURATION", serviceCodes: durationNeeded };
    const lines = serviceCodes.map((serviceCode) => {
      const serviceRows = (rows ?? []).filter((row) => row.code === serviceCode);
      if (!serviceRows.length || serviceRows.every((row) => row.pricing_status === "REQUIRES_QUOTE")) throw new ServicePriceUnavailableError(serviceCode, fixedCodes.has(serviceCode) ? "FIXED" : "DURATION", fixedCodes.has(serviceCode) ? null : duration ?? null);
      return { serviceCode, ...resolveServicePrice({ serviceCode, requestedDuration: duration ?? 0, rows: serviceRows, fixedHours: fixedCodes.has(serviceCode) ? 0 : undefined }) };
    });
    const municipality = municipalities.find((item) => item.name.localeCompare(input.commune?.trim() ?? "", "es", { sensitivity: "base" }) === 0)
      ?? municipalities.find((item) => input.text.toLocaleLowerCase("es-CL").includes(item.name.toLocaleLowerCase("es-CL")));
    const venueConfig = ((venuesResult.data?.configuration as { venues?: Array<Record<string, unknown>> } | null)?.venues ?? []) as CanonicalVenue[];
    const venue = input.commune ? resolveCanonicalVenue(input.specialVenue ?? "", input.commune, venueConfig) : null;
    const transport = municipality?.pricingStatus === "DEFINED" ? municipality.transport : 0;
    const venueSurcharge = Number(venue?.surcharge ?? 0);
    return { status: "RESOLVED", lines, transport, venueSurcharge, total: lines.reduce((sum, line) => sum + line.amount, 0) + transport + venueSurcharge };
  } catch (error) {
    if (error instanceof ServicePriceUnavailableError && error.requestedDuration !== null) return { status: "QUOTE_REQUIRED", serviceCodes: [error.serviceCode] };
    return { status: "ERROR", code: "PRICE_LOOKUP_FAILED" };
  }
}

export async function lookupBiancaAvailability(client: SupabaseClient, input: { eventDate?: string; startTime?: string; durationHours?: number; serviceCodes?: readonly string[]; commune?: string; venue?: string }): Promise<BiancaAvailabilityLookupResult> {
  const missing = [!input.eventDate && "event_date", !input.startTime && "start_time", !input.durationHours && "duration", !input.serviceCodes?.length && "service"].filter(Boolean) as string[];
  if (missing.length) return { status: "INSUFFICIENT_DATA", missing };
  try {
    const start = new Date(`${input.eventDate}T${input.startTime}:00`);
    const end = new Date(start.getTime() + Number(input.durationHours) * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { status: "INSUFFICIENT_DATA", missing: ["event_date"] };
    const { data, error } = await client.rpc("preflight_draft_capacity", {
      p_service_codes: input.serviceCodes,
      p_event_type: null,
      p_event_date: input.eventDate,
      p_service_start: start.toISOString(),
      p_service_end: end.toISOString(),
      p_address: input.venue ?? "",
      p_city: input.commune ?? "",
      p_shell: null,
    });
    if (error) return { status: "TECHNICAL_ERROR", code: "AVAILABILITY_LOOKUP_FAILED" };
    const status = typeof data === "string" ? data : (data as { status?: string } | null)?.status;
    return status === "AVAILABLE" ? { status: "AVAILABLE" } : { status: "UNAVAILABLE" };
  } catch {
    return { status: "TECHNICAL_ERROR", code: "AVAILABILITY_LOOKUP_FAILED" };
  }
}
