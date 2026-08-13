"use client";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Search,
} from "lucide-react";
import {
  MODULE_WORKSPACES,
  type FounderWorkspacePreferences,
  type ModuleWorkspaceKey,
} from "./catalog";
const LABELS: Record<string, string> = {
  DASHBOARD: "Dashboard",
  CUSTOMERS: "Customers",
  EVENTS: "Events",
  FINANCE: "Finance",
  RECEIVABLES: "Accounts Receivable",
  PAYABLES: "Accounts Payable",
  STAFF: "Staff",
  RESOURCES: "Resources",
  REPORTS: "Reports",
  SETTINGS: "Settings",
};
export function ModuleWorkspaceSettings({
  preferences,
  onChange,
}: {
  preferences: FounderWorkspacePreferences;
  onChange: (next: FounderWorkspacePreferences) => void;
}) {
  const [open, setOpen] = useState<ModuleWorkspaceKey | null>("DASHBOARD");
  const [query, setQuery] = useState("");
  const [dragged, setDragged] = useState<{
    module: string;
    key: string;
  } | null>(null);
  const update = (
    moduleKey: string,
    sectionOrder: string[],
    hiddenSections: string[],
  ) =>
    onChange({
      ...preferences,
      moduleWorkspaces: {
        ...preferences.moduleWorkspaces,
        [moduleKey]: {
          ...preferences.moduleWorkspaces[moduleKey],
          sectionOrder,
          hiddenSections,
        },
      },
    });
  const modules = [
    ...new Set([
      ...Object.keys(MODULE_WORKSPACES),
      ...Object.keys(preferences.moduleWorkspaces),
    ]),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  return (
    <section className="space-y-3 rounded-2xl border p-4 sm:p-5">
      <div>
        <h3 className="font-semibold">Módulos del Founder Workspace</h3>
        <p className="mt-1 text-sm text-muted">
          Abre un módulo para administrar todos sus bloques visibles y ocultos.
        </p>
      </div>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <span className="sr-only">Buscar secciones visibles u ocultas</span>
        <input
          className="min-h-11 w-full rounded-xl border bg-background pl-10 pr-3"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar Workspace, incluso secciones ocultas"
          type="search"
          value={query}
        />
      </label>
      {modules.map((moduleKey) => {
        const expanded = open === moduleKey;
        const config = preferences.moduleWorkspaces[moduleKey];
        if (!config) return null;
        const catalog = (MODULE_WORKSPACES[
          moduleKey as keyof typeof MODULE_WORKSPACES
        ] ?? []) as readonly { key: string; label: string }[];
        const labels = new Map(
          catalog.map((section) => [section.key, section.label]),
        );
        for (const [key, label] of Object.entries(config.sectionLabels ?? {}))
          labels.set(key, label);
        const moduleLabel = LABELS[moduleKey] ?? moduleKey.replaceAll("_", " ");
        const matchingKeys = config.sectionOrder.filter((key) =>
          `${moduleLabel} ${labels.get(key) ?? key}`
            .toLocaleLowerCase("es")
            .includes(normalizedQuery),
        );
        if (normalizedQuery && matchingKeys.length === 0) return null;
        const drop = (target: string) => {
          if (
            !dragged ||
            dragged.module !== moduleKey ||
            dragged.key === target
          )
            return;
          const order = [...config.sectionOrder],
            from = order.indexOf(dragged.key),
            to = order.indexOf(target);
          if (from < 0 || to < 0) return;
          order.splice(to, 0, order.splice(from, 1)[0]);
          setDragged(null);
          update(moduleKey, order, config.hiddenSections);
        };
        const list = (hidden: boolean) =>
          config.sectionOrder
            .filter((key) => !normalizedQuery || matchingKeys.includes(key))
            .filter((key) => config.hiddenSections.includes(key) === hidden)
            .map((key) => (
              <article
                className="flex items-center gap-2 rounded-xl border bg-background/30 p-3"
                draggable
                key={key}
                onDragStart={() => setDragged({ module: moduleKey, key })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => drop(key)}
              >
                <GripVertical className="size-4 cursor-grab text-muted" />
                <span className="flex-1 text-sm font-medium">
                  {labels.get(key) ?? key}
                </span>
                <button
                  aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${labels.get(key) ?? key}`}
                  className="rounded-lg p-2 text-muted hover:text-foreground"
                  onClick={() =>
                    update(
                      moduleKey,
                      config.sectionOrder,
                      hidden
                        ? config.hiddenSections.filter(
                            (candidate) => candidate !== key,
                          )
                        : [...config.hiddenSections, key],
                    )
                  }
                  type="button"
                >
                  {hidden ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </button>
              </article>
            ));
        return (
          <div className="rounded-xl border" key={moduleKey}>
            <button
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 p-4 text-left font-semibold"
              onClick={() => setOpen(expanded ? null : moduleKey)}
              type="button"
            >
              {expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              <span className="flex-1">{moduleLabel}</span>
              <span className="text-xs font-normal text-muted">
                {config.sectionOrder.length - config.hiddenSections.length}{" "}
                visibles · {config.hiddenSections.length} ocultas
              </span>
            </button>
            {expanded ? (
              <div className="grid gap-5 border-t p-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Visible Sections
                  </h4>
                  <div className="space-y-2">{list(false)}</div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Hidden Sections
                  </h4>
                  <div className="space-y-2">{list(true)}</div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
