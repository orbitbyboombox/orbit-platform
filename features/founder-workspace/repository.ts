import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WORKSPACE,
  EVENT_MODULES,
  MODULE_WORKSPACES,
  defaultModuleWorkspaces,
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
      "navigation_order,hidden_navigation,quick_action_order,hidden_quick_actions,favorite_quick_actions,widget_order,hidden_widgets,hidden_event_modules,module_workspaces",
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
  const defaults = defaultModuleWorkspaces();
  const rawStoredModules = (data.module_workspaces ?? {}) as Record<string, { sectionOrder?: string[]; hiddenSections?: string[]; sectionLabels?: Record<string,string> }>;
  const storedModules = Object.fromEntries(Object.entries(rawStoredModules).map(([key, value]) => [key, {
    sectionOrder: Array.isArray(value?.sectionOrder) ? value.sectionOrder : [],
    hiddenSections: Array.isArray(value?.hiddenSections) ? value.hiddenSections : [],
    sectionLabels: value?.sectionLabels && typeof value.sectionLabels === "object" ? value.sectionLabels : {},
  }])) as Record<string, { sectionOrder: string[]; hiddenSections: string[]; sectionLabels: Record<string,string> }>;
  const knownModules = Object.fromEntries(Object.entries(MODULE_WORKSPACES).map(([moduleKey, sections]) => {
    const known: string[] = sections.map((section) => section.key);
    const storedModule = storedModules[moduleKey];
    if (!storedModule) {
      const fallback = defaults[moduleKey as keyof typeof defaults];
      return [moduleKey, moduleKey === "EVENTS" ? { ...fallback, hiddenSections: hidden } : fallback];
    }
    const storedOrder = storedModule?.sectionOrder ?? [];
    const newKeys = known.filter((key) => !storedOrder.includes(key));
    const hiddenByDefault = sections
      .filter((section) => newKeys.includes(section.key) && !section.defaultVisible)
      .map((section) => section.key);
    const hiddenSections = [
      ...(storedModule?.hiddenSections ?? []),
      ...hiddenByDefault,
    ];
    return [moduleKey, { sectionOrder: [...storedOrder, ...newKeys], hiddenSections: [...new Set(hiddenSections)], sectionLabels:{...defaults[moduleKey as keyof typeof defaults].sectionLabels,...storedModule.sectionLabels} }];
  })) as FounderWorkspacePreferences["moduleWorkspaces"];
  const moduleWorkspaces={...storedModules,...knownModules} as FounderWorkspacePreferences["moduleWorkspaces"];
  const storedNavigation = (data.navigation_order ?? []) as FounderWorkspacePreferences["navigationOrder"];
  const newNavigation = DEFAULT_WORKSPACE.navigationOrder.filter(
    (key) => !storedNavigation.includes(key),
  );
  return {
    navigationOrder: [...storedNavigation, ...newNavigation],
    hiddenNavigation: [
      ...(data.hidden_navigation ?? []),
      ...newNavigation.filter((key) =>
        DEFAULT_WORKSPACE.hiddenNavigation.includes(key),
      ),
    ].filter((key, index, values) => values.indexOf(key) === index),
    quickActionOrder: data.quick_action_order as QuickActionKey[],
    hiddenQuickActions: data.hidden_quick_actions as QuickActionKey[],
    favoriteQuickActions: data.favorite_quick_actions as QuickActionKey[],
    widgetOrder: data.widget_order as WorkspaceWidgetKey[],
    hiddenWidgets: data.hidden_widgets as WorkspaceWidgetKey[],
    hiddenEventModules: [...new Set(hidden)],
    moduleWorkspaces,
  };
}
