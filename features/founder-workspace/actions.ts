"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FounderWorkspacePreferences } from "./catalog";
export async function saveFounderWorkspaceAction(
  value: FounderWorkspacePreferences,
) {
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("save_founder_workspace", {
      p_quick_action_order: value.quickActionOrder,
      p_hidden_quick_actions: value.hiddenQuickActions,
      p_favorite_quick_actions: value.favoriteQuickActions,
      p_widget_order: value.widgetOrder,
      p_hidden_widgets: value.hiddenWidgets,
      p_hidden_event_modules: value.hiddenEventModules,
      p_navigation_order: value.navigationOrder,
      p_hidden_navigation: value.hiddenNavigation,
    });
    if (error) throw error;
    revalidatePath("/operations");
    revalidatePath("/projects/[projectId]", "page");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible guardar Mi Escritorio.",
    };
  }
}
export async function resetFounderWorkspaceAction() {
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("reset_founder_workspace");
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
          : "No fue posible restaurar Mi Escritorio.",
    };
  }
}
