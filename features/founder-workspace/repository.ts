import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WORKSPACE,
  EVENT_MODULES,
  type EventModuleKey,
  type FounderWorkspacePreferences,
  type QuickActionKey,
  type WorkspaceWidgetKey,
} from "./catalog";
export async function loadFounderWorkspace(
  client: SupabaseClient,
  userId: string,
): Promise<FounderWorkspacePreferences> {
  const { data, error } = await client
    .from("founder_workspace_preferences")
    .select(
      "navigation_order,hidden_navigation,quick_action_order,hidden_quick_actions,favorite_quick_actions,widget_order,hidden_widgets,hidden_event_modules",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "42703")
      return structuredClone(DEFAULT_WORKSPACE);
    throw error;
  }
  if (!data) return structuredClone(DEFAULT_WORKSPACE);
  const stored = (data.hidden_event_modules ?? []) as EventModuleKey[];
  const known = new Set(EVENT_MODULES.map((item) => item.key));
  const hidden = [
    ...stored.filter((key) => known.has(key)),
    ...EVENT_MODULES.filter(
      (item) => !item.defaultVisible && !stored.includes(item.key),
    ).map((item) => item.key),
  ];
  return {
    navigationOrder: data.navigation_order ?? DEFAULT_WORKSPACE.navigationOrder,
    hiddenNavigation: data.hidden_navigation ?? [],
    quickActionOrder: data.quick_action_order as QuickActionKey[],
    hiddenQuickActions: data.hidden_quick_actions as QuickActionKey[],
    favoriteQuickActions: data.favorite_quick_actions as QuickActionKey[],
    widgetOrder: data.widget_order as WorkspaceWidgetKey[],
    hiddenWidgets: data.hidden_widgets as WorkspaceWidgetKey[],
    hiddenEventModules: [...new Set(hidden)],
  };
}
