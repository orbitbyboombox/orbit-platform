"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function dismissFounderActionsAction(actionKeys: string[]) {
  try {
    const keys = Array.from(new Set(actionKeys.map((value) => value.trim()).filter(Boolean)));
    if (!keys.length) return { ok: true as const };
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
      throw new Error("No tienes permiso para gestionar estos pendientes.");
    }

    const now = new Date().toISOString();
    const { error } = await client.from("founder_action_user_states").upsert(
      keys.map((action_key) => ({
        user_id: auth.user!.id,
        action_key,
        dismissed_at: now,
        updated_at: now,
      })),
      { onConflict: "user_id,action_key" },
    );
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/notifications");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "No fue posible marcar el pendiente como listo.",
    };
  }
}
