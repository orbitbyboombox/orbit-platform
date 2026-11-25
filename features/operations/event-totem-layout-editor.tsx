"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emptyTotemLayout, getTotemFinalizationWarnings, validateTotemLayout, type EventTotemLayout, type TotemAssignmentOption } from "./event-totem-layout";

type Option = { id: string; label: string };

/** Reusable Admin editor. Parent must provide an authorized, persistent save action. */
export function EventTotemLayoutEditor({
  initialLayout,
  boxes,
  blocks,
  assignments,
  requiredCaseCount,
  onSave,
  onSaved,
}: {
  initialLayout?: EventTotemLayout;
  boxes: Array<Option & { stock?: number }>;
  blocks: Option[];
  assignments: Array<Option & { blockId: string | null; assignmentType?: string }>;
  requiredCaseCount: number;
  onSave: (layout: EventTotemLayout, finalize?: boolean) => Promise<unknown>;
  onSaved?: (layout: EventTotemLayout) => void;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<EventTotemLayout>(() => initialLayout ?? emptyTotemLayout());
  const [eventBlocks, setEventBlocks] = useState(blocks);
  const [eventAssignments, setEventAssignments] = useState(assignments);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [openPositions, setOpenPositions] = useState<string[]>([]);
  const assignedBoxes = layout.positions.filter(position => position.assetId).length;
  const pendingOperators = layout.positions.reduce((total, position) => total + eventBlocks.filter(block => !position.blocks.some(item => item.blockId === block.id && item.assignmentId)).length, 0);
  const context = {
    assetIds: new Set(boxes.map(box => box.id)),
    blockIds: new Set(eventBlocks.map(block => block.id)),
    assignmentBlockIds: new Map(eventAssignments.map(assignment => [assignment.id, assignment.blockId])),
  };
  const errors = validateTotemLayout(layout, context);
  const finalizationWarnings = getTotemFinalizationWarnings(layout, eventAssignments.map(item => ({ id: item.id, blockId: item.blockId, assignmentType: item.assignmentType ?? "OPERATOR" })), new Set(eventBlocks.map(block => block.id)), requiredCaseCount);
  const canAdd = layout.positions.length < 30;
  const change = (index: number, patch: Partial<EventTotemLayout["positions"][number]>) => {
    setLayout(previous => ({ ...previous, positions: previous.positions.map((position, i) => i === index ? { ...position, ...patch } : position) }));
    setMessage("");
  };
  return <section aria-label="Distribución de tótems" className="space-y-4 rounded-2xl border p-4">
    <header className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Operaciones · BOOMBOX</p><h2 className="text-xl font-semibold">Distribución Multicaja</h2><p className="text-sm opacity-70">Una reserva, varias cajas y operadores por bloque. Abre solo el tótem que necesites editar.</p></header>
    {layout.enabled && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Tótems",layout.positions.length],["CASE asignadas",assignedBoxes],["Turnos pendientes",pendingOperators],["Operadores",eventAssignments.filter(item => (item.assignmentType ?? "OPERATOR") === "OPERATOR").length]].map(([label,value]) => <div key={label} className="rounded-xl border bg-white/[.03] p-3"><p className="text-xs opacity-65">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>}
    <label className="flex items-center gap-2"><input type="checkbox" checked={layout.enabled} onChange={event => setLayout(previous => ({ ...previous, enabled: event.target.checked }))} /> Activar multicaja para este evento</label>
    {layout.enabled && eventBlocks.length === 0 && <p className="rounded-lg border p-3 text-sm opacity-80">Guarda un borrador para iniciar la distribución. ORBIT podrá crear el bloque operacional desde el horario de servicio confirmado; luego podrás asignar cajas u operadores en el orden que prefieras. Montaje y desmontaje mantienen sus roles separados.</p>}
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
      <span className="opacity-70">Puedes guardar posiciones pendientes y vincular operadores tras crear el bloque.</span>
    </label>}
    {layout.enabled && <div className="space-y-4">{layout.positions.map((position, index) => <div key={position.id} className="overflow-hidden rounded-xl border bg-white/[.02]"><button type="button" aria-expanded={openPositions.includes(position.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-white/[.04]" onClick={() => setOpenPositions(previous => previous.includes(position.id) ? previous.filter(id => id !== position.id) : [...previous, position.id])}><span className="min-w-0"><strong className="block">{position.label || `Tótem ${index + 1}`}</strong><span className="block truncate text-xs opacity-65">{boxes.find(box => box.id === position.assetId)?.label ?? "CASE pendiente"} · {position.location || "Ubicación pendiente"} · {eventBlocks.filter(block => position.blocks.some(item => item.blockId === block.id && item.assignmentId)).length}/{eventBlocks.length} turnos</span></span><span className="shrink-0 text-sm text-blue-400">{openPositions.includes(position.id) ? "Cerrar −" : "Editar +"}</span></button>{openPositions.includes(position.id) && <div className="space-y-3 border-t p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input className="mt-1 w-full rounded border p-2" value={position.label} maxLength={100} onChange={event => change(index, { label: event.target.value })} /></label>
        <label className="text-sm">Caja física<select className="mt-1 w-full rounded border p-2" value={position.assetId ?? ""} onChange={event => change(index, { assetId: event.target.value || null })}><option value="">Sin asignar</option>{boxes.map(box => <option key={box.id} value={box.id}>{box.label}{box.stock !== undefined ? ` · ${box.stock} fotos` : ""}</option>)}</select></label>
        <label className="text-sm">Ubicación en el parque<input className="mt-1 w-full rounded border p-2" value={position.location} maxLength={250} placeholder="Ej. Entrada norte" onChange={event => change(index, { location: event.target.value })} /></label>
        <label className="text-sm">Referencia<input className="mt-1 w-full rounded border p-2" value={position.reference} maxLength={250} placeholder="Ej. Junto a escenario" onChange={event => change(index, { reference: event.target.value })} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{eventBlocks.map(block => <label key={block.id} className="text-sm">{block.label}<select className="mt-1 w-full rounded border p-2" value={position.blocks.find(item => item.blockId === block.id)?.assignmentId ?? ""} onChange={event => change(index, { blocks: [...position.blocks.filter(item => item.blockId !== block.id), { blockId: block.id, assignmentId: event.target.value || null }] })}><option value="">Operador pendiente</option>{eventAssignments.filter(assignment => (assignment.assignmentType ?? "OPERATOR") === "OPERATOR" && (assignment.blockId === block.id || assignment.blockId === null)).map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.label}{assignment.blockId === null ? " · Vincular al bloque" : ""}</option>)}</select></label>)}</div>
      <div className="rounded-lg border p-3 text-sm"><strong>Resumen</strong><div className="mt-2 grid gap-2 sm:grid-cols-2">{position.blocks.map(shift => { const operator = eventAssignments.find(item => item.id === shift.assignmentId); const stock = boxes.find(box => box.id === position.assetId)?.stock; return <div key={shift.blockId} className="rounded border p-2"><span className="block font-medium">{operator?.label ?? "Operador pendiente"}</span><span className="block opacity-70">{operator ? "Servicio · asignación existente" : "Pendiente"} · {boxes.find(box => box.id === position.assetId)?.label ?? "CASE pendiente"}{stock !== undefined ? ` · ${stock} fotos iniciales` : ""}</span></div>; })}</div></div>
      <button type="button" className="text-sm underline disabled:opacity-40" disabled={layout.positions.length <= 1} onClick={() => { setLayout(previous => ({ ...previous, positions: previous.positions.filter(item => item.id !== position.id) })); setMessage(""); }}>Quitar posición</button>
    </div>}</div>)}
    <button type="button" disabled={!canAdd} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => { const id = crypto.randomUUID(); setLayout(previous => ({ ...previous, positions: [...previous.positions, { id, label: `Tótem ${previous.positions.length + 1}`, location: "", reference: "", assetId: null, blocks: [] }] })); setOpenPositions(previous => [...previous, id]); }}>Agregar tótem</button></div>}
    {errors.length > 0 && <div role="alert" className="text-sm text-red-600">{errors.join("; ")}</div>}
    {layout.enabled && finalizationWarnings.length > 0 && <div role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"><strong>Distribución pendiente</strong><ul className="list-disc pl-5">{finalizationWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <button type="button" disabled={saving || errors.length > 0} className="rounded border px-4 py-2 disabled:opacity-50" onClick={async () => { setSaving(true); setMessage(""); try { const draft = { ...layout, finalized: false }; const result = await onSave(draft, false) as { layout?: EventTotemLayout; blocks?: Option[]; assignments?: Array<Option & { blockId: string | null }> }; const savedLayout = result?.layout ?? draft; if (result?.blocks) setEventBlocks(result.blocks); if (result?.assignments) setEventAssignments(result.assignments); onSaved?.(savedLayout); setLayout(savedLayout); router.refresh(); setMessage("Borrador guardado"); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el borrador"); } finally { setSaving(false); } }}>{saving ? "Guardando..." : "Guardar borrador"}</button>
    <button type="button" disabled={saving || errors.length > 0 || finalizationWarnings.length > 0} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { setSaving(true); setMessage(""); try { const finalized = { ...layout, finalized: true }; const result = await onSave(finalized, true) as { layout?: EventTotemLayout; blocks?: Option[]; assignments?: Array<Option & { blockId: string | null }> }; const savedLayout = result?.layout ?? finalized; if (result?.blocks) setEventBlocks(result.blocks); if (result?.assignments) setEventAssignments(result.assignments); onSaved?.(savedLayout); setLayout(savedLayout); router.refresh(); setMessage("Distribución finalizada"); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo finalizar la distribución"); } finally { setSaving(false); } }}>{saving ? "Guardando..." : "Finalizar distribución"}</button>
  </section>;
}
