"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetFounderDashboardLayoutAction,
  saveFounderDashboardLayoutAction,
} from "./dashboard-layout.actions";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardLayout,
  type DashboardKpiItemKey,
  type DashboardQuickActionItemKey,
  type DashboardWidgetItemKey,
} from "./dashboard-layout";

type DashboardZone = "kpis" | "quickActions" | "widgets";
type DashboardOrderKey = "kpiOrder" | "quickActionOrder" | "widgetOrder";

export type DashboardLayoutItem = {
  id: DashboardKpiItemKey | DashboardQuickActionItemKey | DashboardWidgetItemKey;
  label: string;
  content: ReactNode;
  className?: string;
};

type DashboardLayoutEditorProps = {
  layout: DashboardLayout;
  kpis: DashboardLayoutItem[];
  quickActions: DashboardLayoutItem[];
  widgets: DashboardLayoutItem[];
};

const zoneLabels: Record<DashboardZone, string> = {
  kpis: "Indicadores principales",
  quickActions: "Acciones rápidas",
  widgets: "Bloques operativos",
};

const zoneColumns: Record<DashboardZone, string> = {
  kpis: "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4",
  quickActions: "grid grid-cols-2 gap-3 md:grid-cols-4",
  widgets: "grid gap-4 lg:grid-cols-2",
};

const zoneOrderKey: Record<DashboardZone, DashboardOrderKey> = {
  kpis: "kpiOrder",
  quickActions: "quickActionOrder",
  widgets: "widgetOrder",
};

const zoneItems: Record<DashboardZone, readonly DashboardLayoutItem["id"][]> = {
  kpis: DEFAULT_DASHBOARD_LAYOUT.kpiOrder,
  quickActions: DEFAULT_DASHBOARD_LAYOUT.quickActionOrder,
  widgets: DEFAULT_DASHBOARD_LAYOUT.widgetOrder,
};

function serializeLayout(layout: DashboardLayout) {
  return JSON.stringify(layout);
}

function moveItem(items: readonly string[], from: string, to: string) {
  const next = [...items];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return next;
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
  return next;
}

function getItemsForZone(zone: DashboardZone, items: DashboardLayoutItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return zoneItems[zone]
    .map((id) => byId.get(id))
    .filter((item): item is DashboardLayoutItem => Boolean(item));
}

export function DashboardLayoutEditor({
  layout,
  kpis,
  quickActions,
  widgets,
}: DashboardLayoutEditorProps) {
  const [draft, setDraft] = useState(layout);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("Pulsa Editar escritorio para reorganizar.");
  const [isPending, startTransition] = useTransition();
  const lastSavedRef = useRef(serializeLayout(layout));
  const pendingSaveRef = useRef(0);
  const draggingRef = useRef<{ zone: DashboardZone; id: string } | null>(null);
  const zoneRefs = useRef<Record<DashboardZone, HTMLDivElement | null>>({
    kpis: null,
    quickActions: null,
    widgets: null,
  });

  useEffect(() => {
    const nextSerialized = serializeLayout(layout);
    lastSavedRef.current = nextSerialized;
    setDraft(layout);
    setSaveState("saved");
    setMessage("Orden guardado.");
  }, [layout]);

  const currentItems = useMemo(
    () => ({
      kpis: getItemsForZone("kpis", kpis),
      quickActions: getItemsForZone("quickActions", quickActions),
      widgets: getItemsForZone("widgets", widgets),
    }),
    [kpis, quickActions, widgets],
  );

  const persist = async (nextLayout: DashboardLayout) => {
    const serialized = serializeLayout(nextLayout);
    if (serialized === lastSavedRef.current) return;
    const saveToken = ++pendingSaveRef.current;
    setSaveState("saving");
    setMessage("Guardando...");
    const result = await saveFounderDashboardLayoutAction(nextLayout);
    if (pendingSaveRef.current !== saveToken) return;
    if (result.ok) {
      lastSavedRef.current = serialized;
      setSaveState("saved");
      setMessage("✓ Orden guardado");
      return;
    }
    setSaveState("error");
    setMessage(result.error);
  };

  const updateZone = (zone: DashboardZone, nextIds: string[]) => {
    const nextLayout = {
      ...draft,
      [zoneOrderKey[zone]]: nextIds,
    } as DashboardLayout;
    setDraft(nextLayout);
    void persist(nextLayout);
  };

  useEffect(() => {
    if (!editing || !draggingRef.current) return;
    const handleMove = (event: PointerEvent) => {
      const active = draggingRef.current;
      if (!active) return;
      const root = zoneRefs.current[active.zone];
      if (!root) return;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-dashboard-item]");
      if (!target) return;
      const targetId = target.dataset.dashboardItem;
      if (!targetId || targetId === active.id) return;
      const zoneOrder = draft[zoneOrderKey[active.zone]];
      const nextOrder = moveItem(zoneOrder, active.id, targetId);
      if (serializeLayout({ ...draft, [zoneOrderKey[active.zone]]: nextOrder } as DashboardLayout) === serializeLayout(draft)) return;
      setDraft((current) =>
        ({
          ...current,
          [zoneOrderKey[active.zone]]: nextOrder,
        }) as DashboardLayout,
      );
    };
    const handleUp = () => {
      const active = draggingRef.current;
      draggingRef.current = null;
      if (!active) return;
      setSaveState("saving");
      setMessage("Guardando...");
      void persist({
        ...draft,
      });
    };
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [draft, editing]);

  const beginDrag = (
    zone: DashboardZone,
    id: string,
    event: ReactPointerEvent,
  ) => {
    if (!editing) return;
    event.preventDefault();
    draggingRef.current = { zone, id };
    setMessage("Arrastra o usa los controles para reordenar.");
  };

  const reset = () => {
    const confirmed = window.confirm(
      "¿Restablecer el orden predeterminado del escritorio?",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await resetFounderDashboardLayoutAction();
      if (!result.ok) {
        setSaveState("error");
        setMessage(result.error);
        return;
      }
      setDraft(structuredClone(DEFAULT_DASHBOARD_LAYOUT));
      lastSavedRef.current = serializeLayout(DEFAULT_DASHBOARD_LAYOUT);
      setSaveState("saved");
      setMessage("✓ Orden predeterminado restaurado");
    });
  };

  const renderZone = (zone: DashboardZone, items: DashboardLayoutItem[]) => {
    const ordered = currentItems[zone];
    const order = [...draft[zoneOrderKey[zone]]] as string[];
    const byId = new Map<string, DashboardLayoutItem>(
      items.map((item) => [item.id, item]),
    );
    const visible = order
      .map((id) => byId.get(id))
      .filter((item): item is DashboardLayoutItem => Boolean(item));
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {zoneLabels[zone]}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {editing
                ? "Arrastra el asa o usa los botones de mover."
                : "El orden se conserva entre dispositivos y sesiones."}
            </p>
          </div>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted">
            {visible.length} visibles
          </span>
        </div>
        <div
          className={zoneColumns[zone]}
          ref={(node) => {
            zoneRefs.current[zone] = node;
          }}
        >
          {visible.map((item) => (
            <DashboardLayoutCard
              className={item.className}
              editing={editing}
              id={item.id}
              key={item.id}
              label={item.label}
              onMoveDown={() => {
                const index = order.indexOf(item.id);
                if (index < 0 || index >= order.length - 1) return;
                updateZone(zone, moveItem(order, item.id, order[index + 1]));
              }}
              onMoveUp={() => {
                const index = order.indexOf(item.id);
                if (index <= 0) return;
                updateZone(zone, moveItem(order, item.id, order[index - 1]));
              }}
              onPointerDown={(event) => beginDrag(zone, item.id, event)}
            >
              {item.content}
            </DashboardLayoutCard>
          ))}
          {ordered.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-sm text-muted">
              No hay elementos configurados en esta zona.
            </p>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <section className="space-y-8 rounded-[2rem] border bg-card p-4 sm:p-6 lg:p-7">
      <header className="flex flex-col gap-4 rounded-[1.75rem] border bg-background/70 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl border bg-card p-3 text-brand">
            <Settings2 className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Founder Dashboard
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Orden personal del escritorio
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Reordena indicadores, acciones rápidas y bloques operativos. El
              orden se guarda para esta cuenta y se adapta al móvil con la
              misma prioridad.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="min-h-11"
            onClick={() => setEditing((value) => !value)}
            variant={editing ? "outline" : "default"}
          >
            <GripVertical className="mr-2 size-4" />
            {editing ? "Salir de edición" : "Editar escritorio"}
          </Button>
          <Button
            className="min-h-11"
            disabled={isPending || saveState === "saving"}
            onClick={reset}
            variant="outline"
          >
            <RotateCcw className="mr-2 size-4" />
            Restablecer orden predeterminado
          </Button>
        </div>
      </header>
      <p
        aria-live="polite"
        className={`rounded-2xl border px-4 py-3 text-sm ${
          saveState === "error"
            ? "border-danger/30 bg-danger/5 text-danger"
            : "border-border bg-background/55 text-muted"
        }`}
      >
        {message}
      </p>
      {renderZone("kpis", kpis)}
      {renderZone("quickActions", quickActions)}
      {renderZone("widgets", widgets)}
    </section>
  );
}

function DashboardLayoutCard({
  children,
  className,
  editing,
  id,
  label,
  onMoveDown,
  onMoveUp,
  onPointerDown,
}: {
  children: ReactNode;
  className?: string;
  editing: boolean;
  id: string;
  label: string;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  return (
    <article
      className={`relative min-w-0 rounded-2xl border bg-card p-4 shadow-sm transition ${
        editing ? "ring-1 ring-brand/15" : ""
      } ${className ?? ""}`}
      data-dashboard-item={id}
      data-dashboard-label={label}
    >
      {editing ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow">
          <button
            aria-label={`Arrastrar ${label}`}
            className="grid size-9 touch-none place-items-center rounded-full text-muted transition hover:text-brand"
            onPointerDown={onPointerDown}
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="flex flex-col">
            <button
              aria-label={`Mover arriba ${label}`}
              className="rounded-full px-2 py-1 text-[11px] font-semibold text-muted transition hover:text-foreground"
              onClick={onMoveUp}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Mover abajo ${label}`}
              className="rounded-full px-2 py-1 text-[11px] font-semibold text-muted transition hover:text-foreground"
              onClick={onMoveDown}
              type="button"
            >
              ↓
            </button>
          </div>
        </div>
      ) : null}
      <div className={editing ? "pr-20" : ""}>{children}</div>
    </article>
  );
}
