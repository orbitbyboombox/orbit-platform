"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { propagateCanonicalEventChange } from "@/features/projects/operations/canonical-event-propagation.service";

export type ConfirmEventTimeResult =
  | { ok: true; data: Record<string, unknown>; calendar: unknown }
  | { ok: false; code: string; message: string };

export async function confirmEventTimeAction(
  projectId: string,
  eventTime: string,
): Promise<ConfirmEventTimeResult> {
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, code: "AUTH_REQUIRED", message: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) {
    return { ok: false, code: "INVALID_TIME", message: "Ingresa una hora válida." };
  }

  const { data, error } = await client.rpc("confirm_project_event_time", {
    p_project_id: projectId,
    p_event_time: eventTime,
  });
  if (error) {
    if (error.message.includes("CAPACITY_CONFLICT")) {
      return { ok: false, code: "CAPACITY_CONFLICT", message: "El horario seleccionado genera un conflicto de disponibilidad." };
    }
    return { ok: false, code: error.code ?? "EVENT_TIME_CONFIRMATION_FAILED", message: "No fue posible confirmar el horario. No se aplicó un cambio parcial." };
  }

  const calendar = await propagateCanonicalEventChange({
    client,
    projectId,
    actorId: auth.user.id,
  });
  revalidatePath("/staff-portal");
  revalidatePath("/operations");
  revalidatePath("/events");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: (data ?? {}) as Record<string, unknown>, calendar };
}
