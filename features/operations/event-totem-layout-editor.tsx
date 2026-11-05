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
}: {
  initialLayout?: EventTotemLayout;
  boxes: Option[];
  blocks: Option[];
  assignments: Array<Option & { blockId: string }>;
  onSave: (layout: EventTotemLayout) => Promise<void>;
}) {
  const [layout, setLayout] = useState<EventTotemLayout>(() => initialLayout ?? emptyTotemLayout());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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
  return <section aria-label="Distribución de tótems" className="space-y-4 rounded-2xl border p-4">
    <header><h2 className="text-lg font-semibold">Distribución de tótems</h2><p className="text-sm opacity-70">Una sola reserva, múltiples cajas. Las ubicaciones se mantienen entre bloques AM y PM.</p></header>
    <label className="flex items-center gap-2"><input type="checkbox" checked={layout.enabled} onChange={event => setLayout(previous => ({ ...previous, enabled: event.target.checked }))} /> Activar multicaja para este evento</label>
    {layout.enabled && <div className="space-y-4">{layout.positions.map((position, index) => <fieldset key={position.id} className="space-y-3 rounded-xl border p-3"><legend className="font-semibold">{position.label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input className="mt-1 w-full rounded border p-2" value={position.label} maxLength={100} onChange={event => change(index, { label: event.target.value })} /></label>
        <label className="text-sm">Caja física<select className="mt-1 w-full rounded border p-2" value={position.assetId ?? ""} onChange={event => change(index, { assetId: event.target.value || null })}><option value="">Sin asignar</option>{boxes.map(box => <option key={box.id} value={box.id}>{box.label}</option>)}</select></label>
        <label className="text-sm">Ubicación en el parque<input className="mt-1 w-full rounded border p-2" value={position.location} maxLength={250} placeholder="Ej. Entrada norte" onChange={event => change(index, { location: event.target.value })} /></label>
        <label className="text-sm">Referencia<input className="mt-1 w-full rounded border p-2" value={position.reference} maxLength={250} placeholder="Ej. Junto a escenario" onChange={event => change(index, { reference: event.target.value })} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{blocks.map(block => <label key={block.id} className="text-sm">{block.label}<select className="mt-1 w-full rounded border p-2" value={position.blocks.find(item => item.blockId === block.id)?.assignmentId ?? ""} onChange={event => change(index, { blocks: [...position.blocks.filter(item => item.blockId !== block.id), { blockId: block.id, assignmentId: event.target.value || null }] })}><option value="">Operador pendiente</option>{assignments.filter(assignment => assignment.blockId === block.id).map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}</select></label>)}</div>
      <button type="button" className="text-sm underline" onClick={() => setLayout(previous => ({ ...previous, positions: previous.positions.filter(item => item.id !== position.id) }))}>Quitar posición</button>
    </fieldset>)}
    <button type="button" disabled={!canAdd} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => setLayout(previous => ({ ...previous, positions: [...previous.positions, { id: crypto.randomUUID(), label: `Tótem ${previous.positions.length + 1}`, location: "", reference: "", assetId: null, blocks: [] }] }))}>Agregar tótem</button></div>}
    {errors.length > 0 && <div role="alert" className="text-sm text-red-600">{errors.join("; ")}</div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <button type="button" disabled={saving || errors.length > 0} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { setSaving(true); setMessage(""); try { await onSave(layout); setMessage("Distribución guardada"); } catch { setMessage("No se pudo guardar la distribución"); } finally { setSaving(false); } }}>{saving ? "Guardando..." : "Guardar distribución"}</button>
  </section>;
}
