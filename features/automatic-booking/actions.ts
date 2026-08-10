"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAutomaticBookingInvitation } from "./automatic-booking.service";

export async function sendAutomaticBookingInvitationAction(email: string): Promise<{ ok: boolean; message: string; url?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
    const result = await createAutomaticBookingInvitation(email, auth.user.id);
    return { ok: true, message: "Invitación enviada correctamente.", url: result.url };
  } catch (error) {
    console.error("[ORBIT][AUTO_BOOKING_INVITATION]", error);
    return { ok: false, message: "No fue posible enviar la invitación. Inténtalo nuevamente." };
  }
}
