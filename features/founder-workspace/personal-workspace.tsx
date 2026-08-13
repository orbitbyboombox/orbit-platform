"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, MoreVertical } from "lucide-react";
import { saveFounderWorkspaceAction } from "./actions";
import {
  type FounderWorkspacePreferences,
  type ModuleWorkspaceKey,
} from "./catalog";

const WorkspaceContext = createContext<{
  preferences: FounderWorkspacePreferences;
  update: (next: FounderWorkspacePreferences) => void;
} | null>(null);

export function PersonalWorkspaceProvider({
  children,
  initialPreferences,
}: {
  children: React.ReactNode;
  initialPreferences: FounderWorkspacePreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const update = useCallback((next: FounderWorkspacePreferences) => {
    setPreferences(next);
    saveQueue.current = saveQueue.current.then(() =>
      saveFounderWorkspaceAction(next),
    );
  }, []);
  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export type WorkspaceSection = {
  key: string;
  label: string;
  content: React.ReactNode;
};

function WorkspaceSectionMenu({
  label,
  moduleKey,
  sectionKey,
}: {
  label: string;
  moduleKey: ModuleWorkspaceKey;
  sectionKey: string;
}) {
  const { preferences, update } = usePersonalWorkspace();
  const [open, setOpen] = useState(false);
  const config = preferences.moduleWorkspaces[moduleKey] ?? {
    sectionOrder: [sectionKey],
    hiddenSections: [],
    sectionLabels: { [sectionKey]: label },
  };
  const index = config.sectionOrder.indexOf(sectionKey);
  const persist = (order: string[], hidden = config.hiddenSections) =>
    update({
      ...preferences,
      moduleWorkspaces: {
        ...preferences.moduleWorkspaces,
        [moduleKey]: { ...config, sectionOrder: order, hiddenSections: hidden },
      },
    });
  const move = (offset: number) => {
    const target = index + offset;
    if (index < 0 || target < 0 || target >= config.sectionOrder.length) return;
    const order = [...config.sectionOrder];
    [order[index], order[target]] = [order[target], order[index]];
    persist(order);
    setOpen(false);
  };
  return (
    <div className="relative z-20 ml-auto w-fit">
      <button
        aria-expanded={open}
        aria-label={`Administrar ${label}`}
        className="grid size-11 place-items-center text-brand transition hover:text-orange-300"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreVertical className="size-5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 w-44 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-1.5 shadow-xl">
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background"
            disabled={index <= 0}
            onClick={() => move(-1)}
            type="button"
          >
            <ArrowUp className="size-4" />
            Mover arriba
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background"
            disabled={index < 0 || index >= config.sectionOrder.length - 1}
            onClick={() => move(1)}
            type="button"
          >
            <ArrowDown className="size-4" />
            Mover abajo
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-background"
            onClick={() =>
              persist(config.sectionOrder, [
                ...new Set([...config.hiddenSections, sectionKey]),
              ])
            }
            type="button"
          >
            <EyeOff className="size-4" />
            Ocultar sección
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PersonalWorkspaceSections({
  moduleKey,
  sections,
}: {
  moduleKey: ModuleWorkspaceKey;
  sections: WorkspaceSection[];
}) {
  const context = useContext(WorkspaceContext);
  const [dragged, setDragged] = useState<string | null>(null);
  const config = context?.preferences.moduleWorkspaces[moduleKey];
  useEffect(() => {
    if (!context || !config) return;
    const missing = sections.filter(
      (section) => !config.sectionOrder.includes(section.key),
    );
    const labels = Object.fromEntries(
      sections.map((section) => [section.key, section.label]),
    );
    if (
      !missing.length &&
      Object.entries(labels).every(
        ([key, label]) => config.sectionLabels?.[key] === label,
      )
    )
      return;
    context.update({
      ...context.preferences,
      moduleWorkspaces: {
        ...context.preferences.moduleWorkspaces,
        [moduleKey]: {
          ...config,
          sectionOrder: [
            ...config.sectionOrder,
            ...missing.map((section) => section.key),
          ],
          hiddenSections: [
            ...config.hiddenSections,
            ...missing.map((section) => section.key),
          ],
          sectionLabels: { ...config.sectionLabels, ...labels },
        },
      },
    });
  }, [config, context, moduleKey, sections]);
  if (!context || !config)
    return (
      <>
        {sections.map((section) => (
          <div key={section.key}>{section.content}</div>
        ))}
      </>
    );
  const known = sections.map((section) => section.key);
  const orderedKeys = [
    ...config.sectionOrder.filter((key) => known.includes(key)),
    ...known.filter((key) => !config.sectionOrder.includes(key)),
  ];
  const visible = orderedKeys.filter(
    (key) => !config.hiddenSections.includes(key),
  );
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const saveConfig = (
    sectionOrder: string[],
    hiddenSections = config.hiddenSections,
  ) =>
    context.update({
      ...context.preferences,
      moduleWorkspaces: {
        ...context.preferences.moduleWorkspaces,
        [moduleKey]: { ...config, sectionOrder, hiddenSections },
      },
    });
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    const order = [...config.sectionOrder];
    const from = order.indexOf(dragged);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragged(null);
    saveConfig(order);
  };
  return (
    <div className="space-y-7">
      {visible.map((key) => {
        const section = byKey.get(key);
        if (!section) return null;
        return (
          <section
            data-workspace-block
            data-workspace-key={key}
            data-workspace-label={section.label}
            draggable
            key={key}
            onDragStart={() => setDragged(key)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => drop(key)}
          >
            {section.content}
          </section>
        );
      })}
    </div>
  );
}

type GlobalWorkspaceTarget = { element: HTMLElement; menuTop: number };

const ROUTE_MODULES: [RegExp, ModuleWorkspaceKey][] = [
  [/^\/operations|^\/$/, "DASHBOARD"],
  [/^\/customers/, "CUSTOMERS"],
  [/^\/(events|projects)/, "EVENTS"],
  [/^\/finance\/receivables/, "RECEIVABLES"],
  [/^\/finance\/payables/, "PAYABLES"],
  [/^\/finance/, "FINANCE"],
  [/^\/resources\/staff/, "STAFF"],
  [/^\/resources/, "RESOURCES"],
  [/^\/reports/, "REPORTS"],
  [/^\/settings/, "SETTINGS"],
];
const BLOCK_SELECTOR =
  "[data-workspace-block],[data-workspace-section],section,article,details";

export function GlobalLayoutEngine() {
  const pathname = usePathname();
  const context = useContext(WorkspaceContext);
  const [targets, setTargets] = useState<Record<string, GlobalWorkspaceTarget>>(
    {},
  );
  const dragged = useRef<string | null>(null);
  const moduleKey = resolveModuleKey(pathname);
  useEffect(() => {
    if (!context || !moduleKey) return;
    let timer: ReturnType<typeof setTimeout>;
    const discover = () => {
      const root = document.getElementById("platform-workspace-content");
      if (!root) return;
      const candidates = [
        ...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR),
      ].filter((element) => isOperationalBlock(element));
      const used = new Map<string, number>();
      const found: Record<string, GlobalWorkspaceTarget> = {};
      const labels: Record<string, string> = {};
      for (const element of candidates) {
        const label = workspaceLabel(element);
        const base =
          element.dataset.workspaceKey ||
          element.id ||
          slug(label) ||
          element.tagName.toLowerCase();
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const key = count ? `${base}-${count + 1}` : base;
        const header = workspaceMenuHost(element);
        const title = workspaceHeaderTitle(element, header);
        element.dataset.workspaceKey = key;
        element.dataset.workspaceLabel = label;
        element.style.position = "relative";
        prepareWorkspaceHeader(header);
        found[key] = { element, menuTop: workspaceMenuTop(element, title) };
        labels[key] = label;
      }
      setTargets(found);
      const existing = context.preferences.moduleWorkspaces[moduleKey];
      const config = existing ?? {
        sectionOrder: [],
        hiddenSections: [],
        sectionLabels: {},
      };
      const keys = Object.keys(found);
      const missing = keys.filter((key) => !config.sectionOrder.includes(key));
      const changedLabels = keys.some(
        (key) => config.sectionLabels?.[key] !== labels[key],
      );
      if (missing.length || changedLabels || !existing) {
        context.update({
          ...context.preferences,
          moduleWorkspaces: {
            ...context.preferences.moduleWorkspaces,
            [moduleKey]: {
              ...config,
              sectionOrder: [...config.sectionOrder, ...missing],
              hiddenSections: existing
                ? config.hiddenSections
                : [...config.hiddenSections, ...missing],
              sectionLabels: { ...config.sectionLabels, ...labels },
            },
          },
        });
      }
    };
    discover();
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(discover, 100);
    });
    const root = document.getElementById("platform-workspace-content");
    if (root) observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", discover);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", discover);
    };
  }, [context, moduleKey, pathname]);
  useEffect(() => {
    if (!context || !moduleKey) return;
    const config = context.preferences.moduleWorkspaces[moduleKey];
    if (!config) return;
    const cleanup: Array<() => void> = [];
    for (const [key, { element }] of Object.entries(targets)) {
      element.style.display = config.hiddenSections.includes(key) ? "none" : "";
      element.style.order = String(
        Math.max(0, config.sectionOrder.indexOf(key)),
      );
      element.draggable = true;
      element.classList.add("workspace-draggable");
      prepareOrderingParent(element.parentElement);
      const start = (event: DragEvent) => {
        dragged.current = key;
        event.dataTransfer?.setData("text/orbit-workspace", key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      };
      const over = (event: DragEvent) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      };
      const drop = (event: DragEvent) => {
        event.preventDefault();
        const source =
          dragged.current ||
          event.dataTransfer?.getData("text/orbit-workspace");
        dragged.current = null;
        if (!source || source === key) return;
        const from = config.sectionOrder.indexOf(source),
          to = config.sectionOrder.indexOf(key);
        if (from < 0 || to < 0) return;
        const order = [...config.sectionOrder];
        order.splice(to, 0, order.splice(from, 1)[0]);
        context.update({
          ...context.preferences,
          moduleWorkspaces: {
            ...context.preferences.moduleWorkspaces,
            [moduleKey]: { ...config, sectionOrder: order },
          },
        });
      };
      element.addEventListener("dragstart", start);
      element.addEventListener("dragover", over);
      element.addEventListener("drop", drop);
      cleanup.push(() => {
        element.removeEventListener("dragstart", start);
        element.removeEventListener("dragover", over);
        element.removeEventListener("drop", drop);
        element.classList.remove("workspace-draggable");
      });
    }
    return () => cleanup.forEach((fn) => fn());
  }, [context, moduleKey, targets]);
  if (!context || !moduleKey) return null;
  const labels =
    context.preferences.moduleWorkspaces[moduleKey].sectionLabels ?? {};
  return (
    <>
      {Object.entries(targets).map(([key, { element, menuTop }]) =>
        createPortal(
          <div
            className="absolute right-4 z-30"
            data-workspace-control="true"
            style={{ top: menuTop }}
          >
            <WorkspaceSectionMenu
              label={labels[key] ?? element.dataset.workspaceLabel ?? key}
              moduleKey={moduleKey}
              sectionKey={key}
            />
          </div>,
          element,
          `global-layout-${moduleKey}-${key}`,
        ),
      )}
    </>
  );
}

function resolveModuleKey(pathname: string): ModuleWorkspaceKey {
  const known = ROUTE_MODULES.find(([pattern]) => pattern.test(pathname))?.[1];
  if (known) return known;
  const segment = pathname.split("/").filter(Boolean)[0] ?? "DASHBOARD";
  return slug(segment).replaceAll("-", "_").toUpperCase();
}
function isOperationalBlock(element: HTMLElement) {
  if (
    element.closest("[data-workspace-ignore]") ||
    element.dataset.workspaceControl
  )
    return false;
  if (element.matches("[data-workspace-block],[data-workspace-section]"))
    return true;
  if (!element.matches("section,article,details")) return false;
  return Boolean(
    element.querySelector(
      ":scope > header h1,:scope > header h2,:scope > header h3,:scope > h1,:scope > h2,:scope > h3,:scope > summary",
    ),
  );
}
function prepareOrderingParent(parent: HTMLElement | null) {
  if (!parent || parent.dataset.workspaceOrderingParent) return;
  const display = getComputedStyle(parent).display;
  if (!display.includes("flex") && !display.includes("grid")) {
    parent.dataset.workspaceOriginalDisplay = parent.style.display;
    parent.dataset.workspaceOriginalFlexDirection = parent.style.flexDirection;
    parent.style.display = "flex";
    parent.style.flexDirection = "column";
  }
  parent.dataset.workspaceOrderingParent = "true";
}

function workspaceLabel(element: HTMLElement) {
  return (
    element.dataset.workspaceLabel ||
    element.getAttribute("aria-label") ||
    element.querySelector("h1,h2,h3,summary")?.textContent?.trim() ||
    element.querySelector("[data-workspace-label]")?.textContent?.trim() ||
    element.textContent?.trim().slice(0, 60) ||
    "Sección"
  );
}
function workspaceMenuHost(element: HTMLElement) {
  const explicit = element.querySelector<HTMLElement>(
    ":scope > [data-workspace-header]",
  );
  if (explicit) return explicit;
  const header = element.querySelector<HTMLElement>(":scope > header");
  if (header) return header;
  const title = element.querySelector<HTMLElement>("h1,h2,h3,summary");
  if (title?.parentElement && element.contains(title.parentElement))
    return title.parentElement;
  return element;
}
function workspaceHeaderTitle(element: HTMLElement, host: HTMLElement) {
  return host.matches("h1,h2,h3,summary")
    ? host
    : (host.querySelector<HTMLElement>("h1,h2,h3,summary") ??
        element.querySelector<HTMLElement>("h1,h2,h3,summary"));
}
function prepareWorkspaceHeader(host: HTMLElement) {
  if (!host.dataset.workspaceOriginalPaddingRight)
    host.dataset.workspaceOriginalPaddingRight =
      getComputedStyle(host).paddingRight;
  host.style.position = "relative";
  host.style.paddingRight = `calc(${host.dataset.workspaceOriginalPaddingRight} + 3.5rem)`;
}
function workspaceMenuTop(host: HTMLElement, title: HTMLElement | null) {
  if (!title) return 0;
  const hostRect = host.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  return Math.max(
    0,
    titleRect.top - hostRect.top + (titleRect.height - 44) / 2,
  );
}
function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function usePersonalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("PersonalWorkspaceProvider no está disponible.");
  return value;
}
