"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateOperationalGaps, sortOperationalBlocks, type OperationalBlock } from "./operational-blocks";
import { deleteOperationalBlockAction, saveOperationalBlockAction } from "./operational-blocks.actions";

export function OperationalBlocksPanel({ projectId, initialBlocks }: { projectId: string; initialBlocks: readonly OperationalBlock[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const blocks = sortOperationalBlocks(initialBlocks);
  const gaps = calculateOperationalGaps(blocks);
  const run = (work: () => Promise<{ ok: boolean; message?: string; error?: string }>) => startTransition(async () => { const result = await work(); setMessage(result.ok ? result.message ?? "Actualizado." : result.error ?? "No fue posible actualizar."); });
  return <section className="rounded-2xl border bg-card p-5 sm:p-6" id="operational-blocks">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Planificación operacional</p><h2 className="mt-1 text-xl font-semibold">PLANIFICACIÓN POR BLOQUES</h2><p className="mt-1 text-sm text-muted">Divide la operación interna sin crear otra cotización, reserva ni evento de Calendar.</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">{blocks.length ? `${blocks.length} bloques` : "Evento completo"}</span></div>
    <div className="mt-5 space-y-3">{blocks.map((block) => <div className="flex flex-col gap-3 rounded-xl border bg-background/30 p-3 sm:flex-row sm:items-center" key={block.id}><GripVertical className="hidden size-4 text-muted sm:block" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="font-semibold">{block.name}</p><p className="text-sm text-muted">{new Date(block.startAt).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })} → {new Date(block.endAt).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" })}</p>{block.notes ? <p className="mt-1 text-xs text-muted">{block.notes}</p> : null}</div><span className="text-xs font-semibold uppercase text-brand">{block.status}</span><Button aria-busy={pending} disabled={pending} onClick={() => run(() => deleteOperationalBlockAction(projectId, block.id))} variant="ghost" aria-label={`Eliminar ${block.name}`}><Trash2 className="size-4"/></Button></div>)}{gaps.map((gap) => <div className="rounded-xl border border-dashed p-3 text-sm text-muted" key={`${gap.startAt}-${gap.endAt}`}>Pausa · {gap.durationMinutes} min</div>)}</div>
    <form className="mt-5 grid gap-3 rounded-xl border border-brand/20 bg-brand/5 p-4 sm:grid-cols-2" action={(data) => run(() => saveOperationalBlockAction(data))}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="sequence" value={blocks.length + 1}/><label className="text-sm font-medium">Nombre<input required name="name" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" placeholder="Ej. Bloque AM"/></label><label className="text-sm font-medium">Inicio<input required type="datetime-local" name="startAt" step={60} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label><label className="text-sm font-medium">Fin<input required type="datetime-local" name="endAt" step={60} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label><label className="text-sm font-medium">Notas<input name="notes" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" placeholder="Montaje, pausa o indicaciones"/></label><Button className="sm:col-span-2" aria-busy={pending} disabled={pending} type="submit"><Plus className="size-4"/>Agregar bloque</Button></form>
    {message ? <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p> : null}
  </section>;
}
