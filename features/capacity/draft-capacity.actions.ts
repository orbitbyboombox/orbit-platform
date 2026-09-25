"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DraftCapacityInput = { serviceCodes: string[]; eventType?: string; eventDate?: string; serviceStart?: string; serviceEnd?: string; address?: string; city?: string; shell?: "WHITE" | "BLACK" };

export async function draftCapacityPreflightAction(input: DraftCapacityInput) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { ok: false as const, error: "Sesión requerida." };
  if (!input.eventDate || !input.serviceCodes.length) return { ok: true as const, result: null };
  if (!input.serviceStart || !input.serviceEnd) return { ok: true as const, result: { status: "CAPACITY_PRELIMINARY", reasonCode: "EVENT_TIME_REQUIRED", humanSafeReason: "La disponibilidad preliminar requiere un horario estimado." } };
  const { data, error } = await client.rpc("preflight_draft_capacity", {
    p_service_codes: input.serviceCodes,
    p_event_type: input.eventType ?? null,
    p_event_date: input.eventDate,
    p_service_start: input.serviceStart,
    p_service_end: input.serviceEnd,
    p_address: input.address ?? "",
    p_city: input.city ?? "",
    p_shell: input.shell ?? null,
  });
  if (error) return { ok: false as const, error: "No fue posible validar disponibilidad." };
  return { ok: true as const, result: data };
}
