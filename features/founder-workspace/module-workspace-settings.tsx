"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical } from "lucide-react";
import { MODULE_WORKSPACES, type FounderWorkspacePreferences, type ModuleWorkspaceKey } from "./catalog";

const LABELS: Record<ModuleWorkspaceKey, string> = {
  DASHBOARD: "Dashboard", CUSTOMERS: "Customers", EVENTS: "Events", FINANCE: "Finance",
  RECEIVABLES: "Accounts Receivable", STAFF: "Staff",
  RESOURCES: "Resources", REPORTS: "Reports", SETTINGS:"Settings",
};

export function ModuleWorkspaceSettings({ preferences, onChange }: { preferences: FounderWorkspacePreferences; onChange: (next: FounderWorkspacePreferences) => void }) {
  const [open, setOpen] = useState<ModuleWorkspaceKey | null>("DASHBOARD");
  const [dragged, setDragged] = useState<{ module: ModuleWorkspaceKey; key: string } | null>(null);
  const update = (moduleKey: ModuleWorkspaceKey, sectionOrder: string[], hiddenSections: string[]) => onChange({
    ...preferences,
    moduleWorkspaces: { ...preferences.moduleWorkspaces, [moduleKey]: { sectionOrder, hiddenSections } },
  });
  return <section className="space-y-3 rounded-2xl border p-4 sm:p-5">
    <div><h3 className="font-semibold">Módulos del Founder Workspace</h3><p className="mt-1 text-sm text-muted">Abre un módulo para administrar sus secciones visibles y ocultas. Arrastra para cambiar el orden.</p></div>
    {(Object.keys(MODULE_WORKSPACES) as ModuleWorkspaceKey[]).map((moduleKey) => {
      const expanded = open === moduleKey; const config = preferences.moduleWorkspaces[moduleKey];
      const sections: readonly { key: string; label: string; defaultVisible: boolean }[] = MODULE_WORKSPACES[moduleKey]; const byKey = new Map<string,{key:string;label:string}>(sections.map((section) => [section.key, section]));for(const sectionKey of config.sectionOrder){if(!byKey.has(sectionKey))byKey.set(sectionKey,{key:sectionKey,label:config.sectionLabels?.[sectionKey]??sectionKey})}
      const drop = (target: string) => { if (!dragged || dragged.module !== moduleKey || dragged.key === target) return; const order = [...config.sectionOrder]; const from = order.indexOf(dragged.key); const to = order.indexOf(target); if (from < 0 || to < 0) return; order.splice(to, 0, order.splice(from, 1)[0]); setDragged(null); update(moduleKey, order, config.hiddenSections); };
      const list = (hidden: boolean) => config.sectionOrder.filter((key) => config.hiddenSections.includes(key) === hidden).map((key) => { const section = byKey.get(key); if (!section) return null; return <article className="flex items-center gap-2 rounded-xl border bg-background/30 p-3" draggable key={key} onDragStart={() => setDragged({ module: moduleKey, key })} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(key)}><GripVertical className="size-4 shrink-0 cursor-grab text-muted"/><span className="flex-1 text-sm font-medium">{section.label}</span><button aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${section.label}`} className="rounded-lg p-2 text-muted hover:bg-muted/10 hover:text-foreground" onClick={() => update(moduleKey, config.sectionOrder, hidden ? config.hiddenSections.filter((candidate) => candidate !== key) : [...config.hiddenSections, key])} type="button">{hidden ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}</button></article>; });
      return <div className="rounded-xl border" key={moduleKey}><button aria-expanded={expanded} className="flex w-full items-center gap-3 p-4 text-left font-semibold" onClick={() => setOpen(expanded ? null : moduleKey)} type="button">{expanded ? <ChevronDown className="size-4"/> : <ChevronRight className="size-4"/>}<span className="flex-1">{LABELS[moduleKey]}</span><span className="text-xs font-normal text-muted">{config.sectionOrder.length - config.hiddenSections.length} visibles · {config.hiddenSections.length} ocultas</span></button>{expanded ? <div className="grid gap-5 border-t p-4 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Visible Sections</h4><div className="space-y-2">{list(false)}</div></div><div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Hidden Sections</h4><div className="space-y-2">{list(true)}</div></div></div> : null}</div>;
    })}
  </section>;
}
