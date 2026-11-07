"use client";

import { useState } from "react";
import { emptyTotemLayout, validateTotemLayout, type EventTotemLayout } from "./event-totem-layout";

type Option = { id: string; label: string };

/** Reusable Admin editor. Parent must provide an authorized, persistent save action. */
export function EventTotemLayoutEditor({
  initialLayout,
  boxes,
  blocks,
  assignments,
  onSave,
  onSaved,
}: {
  initialLayout?: EventTotemLayout;
  boxes: Option[];
  blocks: Option[];
  assignments: Array<Option & { blockId: string }>;
  onSave: (layout: EventTotemLayout) => Promise<unknown>;
  onSaved?: (layout: EventTotemLayout) => void;
}) {
  const [layout, setLayout] = useState<EventTotemLayout>(() => initialLayout ?? emptyTotemLayout());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedLayout, setSavedLayout] = useState(() => JSON.stringify(initialLayout ?? emptyTotemLayout()));
  const hasChanges = JSON.stringify(layout) !== savedLayout;
  const [openPositions, setOpenPositions] = useState<string[]>([]);
  const assignedBoxes = layout.positions.filter(position => position.assetId).length;
  const pendingOperators = layout.positions.reduce((total, position) => total + blocks.filter(block => !position.blocks.some(item => item.blockId === block.id && item.assignmentId)).length, 0);
  const context = {
    assetIds: new Set(boxes.map(box => box.id)),
    blockIds: new Set(blocks.map(block => block.id)),
    assignmentBlockIds: new Map(assignments.map(assignment => [assignment.id, assignment.blockId])),
  };
  const errors = validateTotemLayout(layout, context);
  const canAdd = layout.positions.length < 30;
  const change = (index: number, patch: Partial<EventTotemLayout["positions"][number]>) => {
    setLayout(previous => ({ ...previous, positions: previous.positions.map((position, i) => i === index ? { ...position, ...patch } : position) }));
    setMessage("");
  };
  return <section aria-label="Distribución de tótems" className="space-y-4 rounded-2xl border border-white/10 bg-white/[.015] p-3 sm:p-5">
    <header className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Operaciones · BOOMBOX</p><h2 className="text-xl font-semibold">Distribución Multicaja</h2><p className="text-sm opacity-70">Una reserva, varias cajas y operadores por bloque. Abre solo el tótem que necesites editar.</p></header>
    {layout.enabled && <div className="grid grid-cols-3 gap-2">{[["Tótems",layout.positions.length],["CASE asignadas",assignedBoxes],["Turnos pendientes",pendingOperators]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-2.5 sm:p-3"><p className="text-xs opacity-65">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>}
    <label className="flex items-center gap-2"><input type="checkbox" checked={layout.enabled} onChange={event => setLayout(previous => ({ ...previous, enabled: event.target.checked }))} /> Activar multicaja para este evento</label>
    {layout.enabled && <label className="flex items-center gap-3 text-sm">Cantidad de posiciones
      <select aria-label="Cantidad de posiciones" className="rounded border p-2" value={layout.positions.length} onChange={event => {
        const count = Number(event.target.value);
        setLayout(previous => ({
          ...previous,
          positions: Array.from({ length: count }, (_, index) => previous.positions[index] ?? {
            id: crypto.randomUUID(), label: `Tótem ${index + 1}`, location: "", reference: "", assetId: null, blocks: [],
          }),
        }));
        setMessage("");
      }}>{Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
      <span className="opacity-70">Usa los bloques operacionales existentes</span>
    </label>}
    {layout.enabled && <div className="grid gap-2 lg:grid-cols-2">{layout.positions.map((position, index) => <div key={position.id} className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[.025]"><button type="button" aria-expanded={openPositions.includes(position.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-white/[.06]" onClick={() => setOpenPositions(previous => previous.includes(position.id) ? previous.filter(id => id !== position.id) : [...previous, position.id])}><span className="min-w-0"><strong className="block">{position.label || `Tótem ${index + 1}`}</strong><span className="block truncate text-xs opacity-65">{boxes.find(box => box.id === position.assetId)?.label ?? "CASE pendiente"} · {position.location || "Ubicación pendiente"} · {blocks.filter(block => position.blocks.some(item => item.blockId === block.id && item.assignmentId)).length}/{blocks.length} turnos</span></span><span className="shrink-0 text-sm text-blue-400">{openPositions.includes(position.id) ? "Cerrar −" : "Editar +"}</span></button>{openPositions.includes(position.id) && <div className="space-y-3 border-t border-white/10 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input className="mt-1 w-full rounded border p-2" value={position.label} maxLength={100} onChange={event => change(index, { label: event.target.value })} /></label>
        <label className="text-sm">Caja física<select className="mt-1 w-full rounded border p-2" value={position.assetId ?? ""} onChange={event => change(index, { assetId: event.target.value || null })}><option value="">Sin asignar</option>{boxes.map(box => <option key={box.id} value={box.id}>{box.label}</option>)}</select></label>
        <label className="text-sm">Ubicación en el parque<input className="mt-1 w-full rounded border p-2" value={position.location} maxLength={250} placeholder="Ej. Entrada norte" onChange={event => change(index, { location: event.target.value })} /></label>
        <label className="text-sm">Referencia<input className="mt-1 w-full rounded border p-2" value={position.reference} maxLength={250} placeholder="Ej. Junto a escenario" onChange={event => change(index, { reference: event.target.value })} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{blocks.map(block => <label key={block.id} className="text-sm">{block.label}<select className="mt-1 w-full rounded border p-2" value={position.blocks.find(item => item.blockId === block.id)?.assignmentId ?? ""} onChange={event => change(index, { blocks: [...position.blocks.filter(item => item.blockId !== block.id), { blockId: block.id, assignmentId: event.target.value || null }] })}><option value="">Operador pendiente</option>{assignments.filter(assignment => assignment.blockId === block.id).map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}</select></label>)}</div>
      <button type="button" className="text-sm underline disabled:opacity-40" disabled={layout.positions.length <= 1} onClick={() => { setLayout(previous => ({ ...previous, positions: previous.positions.filter(item => item.id !== position.id) })); setMessage(""); }}>Quitar posición</button>
    </div>}</div>)}
    <button type="button" disabled={!canAdd} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => { const id = crypto.randomUUID(); setLayout(previous => ({ ...previous, positions: [...previous.positions, { id, label: `Tótem ${previous.positions.length + 1}`, location: "", reference: "", assetId: null, blocks: [] }] })); setOpenPositions(previous => [...previous, id]); }}>Agregar tótem</button></div>}
    {errors.length > 0 && <div role="alert" className="text-sm text-red-600">{errors.join("; ")}</div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {hasChanges && <p role="status" className="text-sm text-amber-300">Hay cambios sin guardar.</p>}
    <button type="button" disabled={saving || errors.length > 0} className="sticky bottom-3 z-10 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-black/40 hover:bg-blue-500 disabled:opacity-50" onClick={async () => { setSaving(true); setMessage(""); try { const result = await onSave(layout); if (result && typeof result === "object" && "ok" in result && result.ok === false) throw new Error("No se pudo guardar"); setSavedLayout(JSON.stringify(layout)); onSaved?.(layout); setMessage("Distribución guardada"); } catch { setMessage("No se pudo guardar la distribución"); } finally { setSaving(false); } }}>{saving ? "Guardando..." : "Guardar distribución"}</button>
  </section>;
}
