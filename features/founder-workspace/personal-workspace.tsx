"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { EyeOff, GripVertical } from "lucide-react";
import { saveFounderWorkspaceAction } from "./actions";
import type { FounderWorkspacePreferences, ModuleWorkspaceKey } from "./catalog";

const WorkspaceContext = createContext<{
  preferences: FounderWorkspacePreferences;
  update: (next: FounderWorkspacePreferences) => void;
} | null>(null);

export function PersonalWorkspaceProvider({ children, initialPreferences }: { children: React.ReactNode; initialPreferences: FounderWorkspacePreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [, startTransition] = useTransition();
  const update = (next: FounderWorkspacePreferences) => {
    setPreferences(next);
    startTransition(async () => { await saveFounderWorkspaceAction(next); });
  };
  return <WorkspaceContext.Provider value={{ preferences, update }}>{children}</WorkspaceContext.Provider>;
}

export type WorkspaceSection = { key: string; label: string; content: React.ReactNode };

export function PersonalWorkspaceSections({ moduleKey, sections }: { moduleKey: ModuleWorkspaceKey; sections: WorkspaceSection[] }) {
  const context = useContext(WorkspaceContext);
  const [dragged, setDragged] = useState<string | null>(null);
  if (!context) return <>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</>;
  const config = context.preferences.moduleWorkspaces[moduleKey];
  const known = sections.map((section) => section.key);
  const orderedKeys = [...config.sectionOrder.filter((key) => known.includes(key)), ...known.filter((key) => !config.sectionOrder.includes(key))];
  const visible = orderedKeys.filter((key) => !config.hiddenSections.includes(key));
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const saveConfig = (sectionOrder: string[], hiddenSections = config.hiddenSections) => context.update({
    ...context.preferences,
    moduleWorkspaces: { ...context.preferences.moduleWorkspaces, [moduleKey]: { sectionOrder, hiddenSections } },
  });
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    const order = [...config.sectionOrder];
    const from = order.indexOf(dragged); const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragged(null); saveConfig(order);
  };
  return <div className="space-y-7">{visible.map((key) => { const section = byKey.get(key); if (!section) return null; return <section draggable key={key} onDragStart={() => setDragged(key)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(key)}>
    <div className="mb-2 flex justify-end gap-2 opacity-70 transition hover:opacity-100">
      <span className="inline-flex items-center gap-1 text-xs text-muted"><GripVertical className="size-3.5"/>Mover</span>
      <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground" onClick={() => saveConfig(config.sectionOrder, [...config.hiddenSections, key])} type="button"><EyeOff className="size-3.5"/>Ocultar</button>
    </div>
    {section.content}
  </section>; })}</div>;
}

export function usePersonalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("PersonalWorkspaceProvider no está disponible.");
  return value;
}
