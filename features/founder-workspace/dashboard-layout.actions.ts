"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardLayout } from "./dashboard-layout";

export async function saveFounderDashboardLayoutAction(
  layout: DashboardLayout,
) {
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("save_founder_dashboard_layout", {
      p_dashboard_layout: layout,
      p_dashboard_layout_version: layout.version,
    });
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
    const { error } = await client.rpc("reset_founder_dashboard_layout");
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
