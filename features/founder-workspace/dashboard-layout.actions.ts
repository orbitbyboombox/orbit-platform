"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayout } from "./dashboard-layout";

export async function saveFounderDashboardLayoutAction(
  layout: DashboardLayout,
) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const { error } = await client.from("founder_workspace_preferences").upsert(
      {
        user_id: auth.user.id,
        dashboard_layout_version: layout.version,
        dashboard_layout: layout,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible guardar el orden del dashboard.",
    };
  }
}

export async function resetFounderDashboardLayoutAction() {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const { error } = await client.from("founder_workspace_preferences").upsert(
      {
        user_id: auth.user.id,
        dashboard_layout_version: DEFAULT_DASHBOARD_LAYOUT.version,
        dashboard_layout: structuredClone(DEFAULT_DASHBOARD_LAYOUT),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible restaurar el orden del dashboard.",
    };
  }
}
