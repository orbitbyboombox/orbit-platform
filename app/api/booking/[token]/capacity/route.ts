import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticBookingTokenHash } from "@/features/automatic-booking/automatic-booking.service";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const correlationId = randomUUID();
  try {
    const { token } = await params;
    const input = await request.json() as { customer?: { name?: unknown; phone?: unknown }; serviceCodes?: unknown; eventType?: unknown; eventDate?: unknown; serviceStart?: unknown; serviceEnd?: unknown; address?: unknown; city?: unknown; shell?: unknown };
    const serviceCodes = Array.isArray(input.serviceCodes) ? input.serviceCodes.filter((v): v is string => typeof v === "string").slice(0, 3) : [];
    const admin = createAdminClient();
    const { data: invitation } = await admin.from("automatic_booking_invitations").select("id").eq("token_hash", automaticBookingTokenHash(token)).gt("expires_at", new Date().toISOString()).is("consumed_at", null).in("status", ["SENT", "OPENED"]).maybeSingle();
    if (!invitation) return NextResponse.json({ ok: false, status: "BLOCKED", reasonCode: "BOOKING_TOKEN_INVALID", message: "Esta invitación ya no está disponible." }, { status: 403 });
    const has = { hasName: typeof input.customer?.name === "string" && Boolean(input.customer.name.trim()), hasPhone: typeof input.customer?.phone === "string" && Boolean(input.customer.phone), hasEventDate: typeof input.eventDate === "string" && Boolean(input.eventDate), hasStartTime: typeof input.serviceStart === "string" && Boolean(input.serviceStart), hasEndTime: typeof input.serviceEnd === "string" && Boolean(input.serviceEnd), hasLocation: typeof input.address === "string" && Boolean(input.address.trim()) && typeof input.city === "string" && Boolean(input.city.trim()), hasService: serviceCodes.length > 0, hasShell: input.shell === "WHITE" || input.shell === "BLACK" };
    const { data, error } = await admin.rpc("preflight_public_booking_capacity", { p_booking_token: token, p_service_codes: serviceCodes, p_event_type: typeof input.eventType === "string" ? input.eventType.slice(0, 80) : null, p_event_date: typeof input.eventDate === "string" ? input.eventDate : null, p_service_start: typeof input.serviceStart === "string" ? input.serviceStart : null, p_service_end: typeof input.serviceEnd === "string" ? input.serviceEnd : null, p_address: typeof input.address === "string" ? input.address.slice(0, 240) : "", p_city: typeof input.city === "string" ? input.city.slice(0, 120) : "", p_shell: input.shell === "WHITE" || input.shell === "BLACK" ? input.shell : null });
    if (error) {
      if (/Invitación no (válida|disponible)/i.test(error.message)) return NextResponse.json({ ok: false, status: "BLOCKED", reasonCode: "BOOKING_TOKEN_INVALID", message: "Esta invitación ya no está disponible." }, { status: 403 });
      console.error(JSON.stringify({ level: "error", event: "automatic_booking_capacity_preflight_failed", invitationId: invitation.id, correlationId, timestamp: new Date().toISOString(), presence: has, serviceCode: serviceCodes[0] ?? null, shellType: input.shell === "WHITE" || input.shell === "BLACK" ? input.shell : null, capacityStatus: "TECHNICAL_ERROR", reasonCode: "CAPACITY_PREFLIGHT_ERROR", code: error.code, message: "No fue posible validar disponibilidad.", details: error.details, hint: error.hint }));
      return NextResponse.json({ ok: false, status: "TECHNICAL_ERROR", reasonCode: "CAPACITY_PREFLIGHT_ERROR", message: "No pudimos revisar la disponibilidad en este momento. Tus datos siguen guardados. Intenta nuevamente.", correlationId }, { status: 503 });
    }
    console.info(JSON.stringify({ level: "info", event: "automatic_booking_capacity_preflight", invitationId: invitation.id, correlationId, timestamp: new Date().toISOString(), presence: has, serviceCode: serviceCodes[0] ?? null, shellType: input.shell === "WHITE" || input.shell === "BLACK" ? input.shell : null, capacityStatus: typeof data === "object" && data ? (data as { status?: string }).status ?? "UNKNOWN" : "UNKNOWN", reasonCode: typeof data === "object" && data ? (data as { reasonCode?: string }).reasonCode ?? null : null }));
    return NextResponse.json({ ok: true, result: data, correlationId });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "automatic_booking_capacity_preflight_failed", invitationId: "token-scoped", stage: "request", correlationId, code: error instanceof Error ? error.name : "UNKNOWN", message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ ok: false, status: "TECHNICAL_ERROR", reasonCode: "CAPACITY_PREFLIGHT_ERROR", message: "No pudimos revisar la disponibilidad en este momento. Tus datos siguen guardados. Intenta nuevamente.", correlationId }, { status: 503 });
  }
}
