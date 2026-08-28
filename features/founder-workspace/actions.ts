"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE, type FounderWorkspacePreferences } from "./catalog";

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}
export async function saveFounderWorkspaceAction(
  value: FounderWorkspacePreferences,
) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) {
      throw new Error(readableError(authError, "Sesión requerida."));
    }
    const { data: current, error: currentError } = await client
      .from("founder_workspace_preferences")
      .select("version")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (currentError) throw new Error(readableError(currentError, "No fue posible guardar Mi Escritorio."));
    const { error } = await client.from("founder_workspace_preferences").upsert(
      {
        user_id: auth.user.id,
        quick_action_order: value.quickActionOrder,
        hidden_quick_actions: value.hiddenQuickActions,
        favorite_quick_actions: value.favoriteQuickActions,
        widget_order: value.widgetOrder,
        hidden_widgets: value.hiddenWidgets,
        hidden_event_modules: value.hiddenEventModules,
        navigation_order: value.navigationOrder,
        hidden_navigation: value.hiddenNavigation,
        module_workspaces: value.moduleWorkspaces,
        version: (current?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(readableError(error, "No fue posible guardar Mi Escritorio."));
    revalidatePath("/operations");
    revalidatePath("/projects/[projectId]", "page");
    revalidatePath("/customers/[customerId]", "page");
    revalidatePath("/finance");
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
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) {
      throw new Error(readableError(authError, "Sesión requerida."));
    }
    const { data: current, error: currentError } = await client
      .from("founder_workspace_preferences")
      .select("version")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (currentError) throw new Error(readableError(currentError, "No fue posible restaurar Mi Escritorio."));
    const { error } = await client.from("founder_workspace_preferences").upsert(
      {
        user_id: auth.user.id,
        quick_action_order: DEFAULT_WORKSPACE.quickActionOrder,
        hidden_quick_actions: DEFAULT_WORKSPACE.hiddenQuickActions,
        favorite_quick_actions: DEFAULT_WORKSPACE.favoriteQuickActions,
        widget_order: DEFAULT_WORKSPACE.widgetOrder,
        hidden_widgets: DEFAULT_WORKSPACE.hiddenWidgets,
        hidden_event_modules: DEFAULT_WORKSPACE.hiddenEventModules,
        navigation_order: DEFAULT_WORKSPACE.navigationOrder,
        hidden_navigation: DEFAULT_WORKSPACE.hiddenNavigation,
        module_workspaces: DEFAULT_WORKSPACE.moduleWorkspaces,
        version: (current?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(readableError(error, "No fue posible restaurar Mi Escritorio."));
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
