"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { closeStaffPaperBlockAction, loadStaffPaperBlocksAction, type StaffPaperBlock } from "./staff-box-operations.actions";

const moneylessLabel = (block: StaffPaperBlock) => `${block.boxCode} · ${block.blockName}`;

export function StaffPaperBlockCloseoutPanel({ projectId }: { projectId: string }) {
  const [blocks, setBlocks] = useState<StaffPaperBlock[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, { opening: string; reloads: string; remaining: string }>>({});
  const [requests, setRequests] = useState<Record<string, string>>({});

  const load = useCallback(() => startTransition(async () => {
    const result = await loadStaffPaperBlocksAction(projectId);
    if (result.ok) {
      setBlocks(result.blocks);
      setValues((current) => Object.fromEntries(result.blocks.map((block) => [block.assignmentId, current[block.assignmentId] ?? { opening: block.opening < 0 ? "" : String(block.opening), reloads: String(block.reloads), remaining: block.remaining === null ? "" : String(block.remaining) }])));
    } else setMessage(result.message);
  }), [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!blocks.length && !message) return null;
  return <section className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-4" aria-label="Cierre de papel AM y PM" data-paper-block-closeout>
    <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CIERRE DE PAPEL POR BLOQUE</p>
    <p className="mt-1 text-sm text-muted">Solo puedes cerrar la Caja y el bloque que tienes asignados. El papel inicial debe confirmarse; nunca se supone que es cero. PM hereda el saldo verificado de AM en el servidor.</p>
    <div className="mt-4 grid gap-3">{blocks.map((block) => {
      const value = values[block.assignmentId] ?? { opening: block.opening < 0 ? "" : String(block.opening), reloads: String(block.reloads), remaining: "" };
      const remaining = Number(value.remaining);
      const opening = Number(value.opening);
      const reloads = Number(value.reloads);
      const valid = value.opening.trim() !== "" && value.remaining.trim() !== "" && value.reloads.trim() !== "" && Number.isSafeInteger(remaining) && Number.isSafeInteger(opening) && Number.isSafeInteger(reloads) && remaining >= 0 && opening >= 0 && reloads >= 0 && remaining <= opening + reloads;
      return <article className="rounded-xl border bg-background/40 p-3" key={block.assignmentId} data-paper-block={block.blockName}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{moneylessLabel(block)}</p><p className="text-xs text-muted">{block.status === "CLOSED" ? `Cerrado${block.closedAt ? ` · ${new Date(block.closedAt).toLocaleString("es-CL")}` : ""}` : "Pendiente"}</p></div><span className="rounded-full border px-2 py-1 text-xs">{block.status}</span></div>
        {block.status === "PENDING" ? <><div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-xs font-semibold">Inicial<input className="min-h-10 rounded-lg border bg-background px-2 text-sm" type="number" min="0" step="1" value={value.opening} onChange={(event) => setValues((current) => ({ ...current, [block.assignmentId]: { ...value, opening: event.target.value } }))} /></label><label className="grid gap-1 text-xs font-semibold">Recargas<input className="min-h-10 rounded-lg border bg-background px-2 text-sm" type="number" min="0" step="1" value={value.reloads} onChange={(event) => setValues((current) => ({ ...current, [block.assignmentId]: { ...value, reloads: event.target.value } }))} /></label><label className="grid gap-1 text-xs font-semibold">Saldo final<input className="min-h-10 rounded-lg border bg-background px-2 text-sm" type="number" min="0" step="1" value={value.remaining} onChange={(event) => setValues((current) => ({ ...current, [block.assignmentId]: { ...value, remaining: event.target.value } }))} /></label></div><p className="mt-2 text-xs text-muted">Uso calculado: {valid ? opening + reloads - remaining : "—"} fotografías</p><button type="button" className="mt-3 min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" disabled={pending || !valid} onClick={() => startTransition(async () => { const requestId = requests[block.assignmentId] ?? crypto.randomUUID(); setRequests((current) => ({ ...current, [block.assignmentId]: requestId })); const result = await closeStaffPaperBlockAction({ projectId, blockId: block.blockId, assignmentId: block.assignmentId, opening, reloads, remaining, requestId }); setMessage(result.ok ? `${moneylessLabel(block)} cerrado correctamente.` : result.message); if (result.ok) load(); })}>{pending ? "GUARDANDO…" : `CERRAR ${block.blockName.toUpperCase()}`}</button></> : <p className="mt-2 text-sm">Uso registrado: <strong>{block.used ?? 0}</strong> fotografías.</p>}
      </article>;
    })}</div>{message ? <p className="mt-3 text-sm" aria-live="polite">{message}</p> : null}
  </section>;
}
