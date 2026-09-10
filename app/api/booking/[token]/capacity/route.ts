import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const correlationId = randomUUID();
  try {
    const { token } = await params;
    const input = await request.json() as { serviceCodes?: unknown; eventType?: unknown; eventDate?: unknown; serviceStart?: unknown; serviceEnd?: unknown; address?: unknown; city?: unknown; shell?: unknown };
    const serviceCodes = Array.isArray(input.serviceCodes) ? input.serviceCodes.filter((v): v is string => typeof v === "string").slice(0, 3) : [];
    const { data, error } = await createAdminClient().rpc("preflight_public_booking_capacity", { p_booking_token: token, p_service_codes: serviceCodes, p_event_type: typeof input.eventType === "string" ? input.eventType.slice(0, 80) : null, p_event_date: typeof input.eventDate === "string" ? input.eventDate : null, p_service_start: typeof input.serviceStart === "string" ? input.serviceStart : null, p_service_end: typeof input.serviceEnd === "string" ? input.serviceEnd : null, p_address: typeof input.address === "string" ? input.address.slice(0, 240) : "", p_city: typeof input.city === "string" ? input.city.slice(0, 120) : "", p_shell: input.shell === "WHITE" || input.shell === "BLACK" ? input.shell : null });
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "automatic_booking_capacity_preflight_failed", invitationId: "token-scoped", stage: "rpc", correlationId, code: error.code, message: error.message, details: error.details, hint: error.hint }));
      return NextResponse.json({ ok: false, status: "TECHNICAL_ERROR", reasonCode: "CAPACITY_PREFLIGHT_ERROR", message: "No pudimos revisar la disponibilidad en este momento. Tus datos siguen guardados. Intenta nuevamente.", correlationId }, { status: 503 });
    }
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "automatic_booking_capacity_preflight_failed", invitationId: "token-scoped", stage: "request", correlationId, code: error instanceof Error ? error.name : "UNKNOWN", message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ ok: false, status: "TECHNICAL_ERROR", reasonCode: "CAPACITY_PREFLIGHT_ERROR", message: "No pudimos revisar la disponibilidad en este momento. Tus datos siguen guardados. Intenta nuevamente.", correlationId }, { status: 503 });
  }
}
