"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, History, Pencil, Plus, Search, Trash2, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createEquipmentAction,
  deleteEquipmentAction,
  disableEquipmentAction,
  updateEquipmentAction,
  type EquipmentCategory,
  type EquipmentItem,
  type EquipmentStatus,
} from "./equipment-operation-center.actions";

export interface EquipmentHistoryEntry {
  id: string;
  assetId: string;
  message: string;
  occurredAt: string;
}

const categories: readonly { value: EquipmentCategory; label: string }[] = [
  { value: "CLASSIC_TOTEM", label: "Classic Totem" },
  { value: "BLACK_STUDIO", label: "Black Studio" },
  { value: "BBOX360", label: "BBOX360" },
  { value: "LIGHTBOX", label: "LightBox" },
  { value: "BOOMBALL", label: "BoomBall" },
  { value: "PRINTER", label: "Impresora" },
  { value: "CAMERA", label: "Cámara" },
  { value: "CASE", label: "Case" },
  { value: "LIGHT", label: "Luz" },
  { value: "ACCESSORY", label: "Accesorio" },
  { value: "TOTEM", label: "Tótem" },
  { value: "VEHICLE", label: "Vehículo" },
];

const statuses: readonly { value: EquipmentStatus; label: string }[] = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "ASSIGNED", label: "Reservado" },
  { value: "IN_EVENT", label: "En evento" },
  { value: "MAINTENANCE", label: "Mantenimiento" },
  { value: "OUT_OF_SERVICE", label: "Deshabilitado" },
];

const filters = ["ALL", "AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
type Filter = (typeof filters)[number];
type Panel = { kind: "create" } | { kind: "view" | "edit" | "history"; item: EquipmentItem } | null;

function categoryLabel(item: EquipmentItem) {
  if (item.category === "TOTEM" && item.code.startsWith("WHITE")) return "Classic Totem";
  if (item.category === "TOTEM" && item.code.startsWith("BLACK")) return "Black Studio";
  return categories.find((category) => category.value === item.category)?.label ?? item.category;
}

function statusLabel(status: EquipmentStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function StatusPill({ status }: { status: EquipmentStatus }) {
  const color = status === "AVAILABLE" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : status === "MAINTENANCE" ? "border-amber-500/30 bg-amber-500/10 text-amber-600" : status === "OUT_OF_SERVICE" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-blue-500/30 bg-blue-500/10 text-blue-600";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>{statusLabel(status)}</span>;
}

export function EquipmentOperationCenter({ initialItems, historyEntries }: { initialItems: EquipmentItem[]; historyEntries: EquipmentHistoryEntry[] }) {
  const [items, setItems] = useState(initialItems);
  const [history, setHistory] = useState(historyEntries);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return items.filter((item) => {
      const matchesFilter = filter === "ALL" || item.status === filter;
      const haystack = `${item.name} ${item.code} ${categoryLabel(item)} ${statusLabel(item.status)}`.toLocaleLowerCase("es");
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [filter, items, query]);

  function save(formData: FormData, editing: boolean) {
    setError("");
    startTransition(async () => {
      const result = editing ? await updateEquipmentAction(formData) : await createEquipmentAction(formData);
      if (!result.ok) return setError(result.error);
      setItems((current) => editing ? current.map((item) => item.id === result.item.id ? result.item : item) : [result.item, ...current]);
      setHistory((current) => [{ id: crypto.randomUUID(), assetId: result.item.id, message: editing ? `${result.item.name} actualizado.` : `${result.item.name} agregado al inventario.`, occurredAt: new Date().toISOString() }, ...current]);
      setPanel(null);
    });
  }

  function disable(item: EquipmentItem) {
    if (!window.confirm(`¿Deshabilitar ${item.name}?`)) return;
    setError("");
    startTransition(async () => {
      const result = await disableEquipmentAction(item.id, item.version);
      if (!result.ok) return setError(result.error);
      setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry));
      setHistory((current) => [{ id: crypto.randomUUID(), assetId: item.id, message: `${item.name} deshabilitado.`, occurredAt: new Date().toISOString() }, ...current]);
    });
  }

  function remove(item: EquipmentItem) {
    if (!window.confirm(`¿Eliminar ${item.name} del inventario activo? Su historial se conservará.`)) return;
    setError("");
    startTransition(async () => {
      const result = await deleteEquipmentAction(item.id, item.version);
      if (!result.ok) return setError(result.error);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setPanel(null);
    });
  }

  return (
    <section className="space-y-6" aria-labelledby="equipment-title">
      <header className="rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand">EQUIPAMIENTO</p>
            <h1 id="equipment-title" className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Centro de Equipamiento</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Administra disponibilidad, mantenimiento e historial sin salir del módulo.</p>
          </div>
          <Button onClick={() => { setError(""); setPanel({ kind: "create" }); }}><Plus className="size-4" /> Agregar equipo</Button>
        </div>
      </header>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <span className="sr-only">Buscar equipamiento</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código, categoría o estado" className="h-11 w-full rounded-xl border bg-background pl-10 pr-4 text-sm outline-none focus:border-brand" />
        </label>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtros de equipamiento">
          {filters.map((value) => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${filter === value ? "border-brand bg-brand text-white" : "bg-background hover:bg-accent"}`}>{value === "ALL" ? "Todos" : statusLabel(value)}</button>)}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <article key={item.id} className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-lg font-semibold">{item.name}</p><p className="mt-1 text-sm text-muted">{item.code} · {categoryLabel(item)}</p></div>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-5 text-xs text-muted">Usos registrados</p><p className="mt-1 text-2xl font-semibold">{item.usageCount}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
              <button onClick={() => setPanel({ kind: "view", item })} className="rounded-lg border px-2 py-2 text-xs font-semibold hover:bg-accent"><Eye className="mx-auto mb-1 size-4" />Abrir</button>
              <button onClick={() => setPanel({ kind: "edit", item })} className="rounded-lg border px-2 py-2 text-xs font-semibold hover:bg-accent"><Pencil className="mx-auto mb-1 size-4" />Editar</button>
              <button disabled={pending || item.status === "OUT_OF_SERVICE"} onClick={() => disable(item)} className="rounded-lg border px-2 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-40"><X className="mx-auto mb-1 size-4" />Deshabilitar</button>
              <button onClick={() => remove(item)} className="rounded-lg border px-2 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/10"><Trash2 className="mx-auto mb-1 size-4" />Eliminar</button>
              <button onClick={() => setPanel({ kind: "history", item })} className="col-span-2 rounded-lg border px-2 py-2 text-xs font-semibold hover:bg-accent sm:col-span-1 lg:col-span-2 xl:col-span-1"><History className="mx-auto mb-1 size-4" />Historial</button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && <div className="rounded-2xl border border-dashed p-10 text-center"><Warehouse className="mx-auto size-8 text-muted" /><p className="mt-3 font-semibold">No encontramos equipamiento</p><p className="mt-1 text-sm text-muted">Ajusta la búsqueda o agrega un equipo al inventario.</p></div>}

      {panel && <EquipmentPanel panel={panel} historyEntries={history} pending={pending} error={error} onClose={() => { setPanel(null); setError(""); }} onSave={save} />}
    </section>
  );
}

function EquipmentPanel({ panel, historyEntries, pending, error, onClose, onSave }: { panel: Exclude<Panel, null>; historyEntries: EquipmentHistoryEntry[]; pending: boolean; error: string; onClose: () => void; onSave: (data: FormData, editing: boolean) => void }) {
  const item = panel.kind === "create" ? null : panel.item;
  const editing = panel.kind === "edit";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
    <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-brand">EQUIPAMIENTO</p><h2 className="mt-1 text-2xl font-semibold">{panel.kind === "create" ? "Agregar equipo" : panel.kind === "edit" ? "Editar equipo" : panel.kind === "history" ? "Historial" : item?.name}</h2></div><button onClick={onClose} aria-label="Cerrar" className="rounded-lg border p-2 hover:bg-accent"><X className="size-4" /></button></div>
      {panel.kind === "history" && item ? <div className="mt-6 space-y-3">{historyEntries.filter((entry) => entry.assetId === item.id).map((entry) => <div key={entry.id} className="rounded-xl border p-4"><p className="text-sm font-medium">{entry.message}</p><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.occurredAt))}</p></div>)}{!historyEntries.some((entry) => entry.assetId === item.id) && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Este equipo aún no registra movimientos.</p>}</div> : panel.kind === "view" && item ? <dl className="mt-6 grid gap-4 sm:grid-cols-2"><Detail label="Nombre" value={item.name} /><Detail label="Código" value={item.code} /><Detail label="Categoría" value={categoryLabel(item)} /><Detail label="Estado" value={statusLabel(item.status)} /><Detail label="Usos" value={String(item.usageCount)} /></dl> : <form className="mt-6 space-y-4" action={(data) => onSave(data, editing)}>
        {item && <><input type="hidden" name="id" value={item.id} /><input type="hidden" name="version" value={item.version} /></>}
        <Field label="Nombre" name="name" defaultValue={item?.name} />
        <Field label="Código" name="code" defaultValue={item?.code} />
        <Select label="Categoría" name="category" defaultValue={item?.category ?? "CLASSIC_TOTEM"} options={categories} />
        {editing && <Select label="Estado" name="status" defaultValue={item?.status ?? "AVAILABLE"} options={statuses} />}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" disabled={pending} type="submit">{pending ? "Guardando..." : editing ? "Guardar cambios" : "Agregar equipo"}</Button>
      </form>}
    </div>
  </div>;
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) { return <label className="block text-sm font-medium">{label}<input required name={name} defaultValue={defaultValue} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-brand" /></label>; }
function Select<T extends string>({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: T; options: readonly { value: T; label: string }[] }) { return <label className="block text-sm font-medium">{label}<select name={name} defaultValue={defaultValue} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-brand">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
