"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { adminClosePaperBlockAction, loadAdminPaperBlocksAction } from "./admin-paper-block.actions";

type Block = Awaited<ReturnType<typeof loadAdminPaperBlocksAction>>[number];

export function AdminPaperBlockManualPanel({ projectId }: { projectId: string }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { opening: string; reloads: string; remaining: string; reason: string }>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const load = useCallback(async () => {
    try {
      const rows = await loadAdminPaperBlocksAction(projectId);
      setBlocks(rows);
      setDrafts((old) => Object.fromEntries(rows.map((row) => [row.assignmentId, old[row.assignmentId] ?? {
        opening: String(row.opening), reloads: String(row.reloads), remaining: "", reason: "",
      }])));
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cargar los cierres."); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  return <section className="rounded-2xl border p-4 space-y-3" aria-label="Cierre manual AM PM">
    <h2 className="text-lg font-semibold">Cierre manual de papel · Administrador</h2>
    <p className="text-sm opacity-70">Úsalo sólo cuando el operador olvide cerrar AM o PM. Exige motivo y confirmación. Respeta el relevo entre bloques y no permite cerrar dos veces.</p>
    {blocks.map((block) => {
      const value = drafts[block.assignmentId] ?? { opening: String(block.opening), reloads: String(block.reloads), remaining: "", reason: "" };
      const change = (field: keyof typeof value, next: string) => setDrafts((old) => ({ ...old, [block.assignmentId]: { ...value, [field]: next } }));
      const opening = Number(value.opening), reloads = Number(value.reloads), remaining = Number(value.remaining);
      const valid = [value.opening,value.reloads,value.remaining].every((v) => v.trim() !== "") && [opening,reloads,remaining].every((n) => Number.isSafeInteger(n) && n >= 0) && remaining <= opening + reloads && value.reason.trim().length >= 10;
      return <article key={block.assignmentId} className="rounded-xl border p-3 space-y-2">
        <p className="font-semibold">{block.boxCode} · {block.blockName} · {block.operator}</p>
        {block.closed ? <p className="text-sm">Cerrado · saldo final {block.remaining}</p> : <>
          {!block.canClose && <p className="text-sm text-amber-600">Pendiente: debe cerrarse primero el bloque anterior o registrar el snapshot.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            {(["opening","reloads","remaining"] as const).map((field) => <label key={field} className="text-sm">{field === "opening" ? "Inicial" : field === "reloads" ? "Recargas" : "Saldo final"}<input className="block w-full rounded border p-2" type="number" min="0" step="1" value={value[field]} onChange={(e) => change(field,e.target.value)} disabled={pending || !block.canClose || field === "opening" && block.sequence > Math.min(...blocks.map((b) => b.sequence))} /></label>)}
          </div>
          <label className="block text-sm">Motivo del cierre manual<textarea className="block w-full rounded border p-2" value={value.reason} onChange={(e) => change("reason",e.target.value)} placeholder="Ej.: operador olvidó registrar cierre y se verificó el papel físicamente" /></label>
          <button className="rounded bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50" type="button" disabled={pending || !valid || !block.canClose} onClick={() => {
            if (!window.confirm(`¿Confirmas el cierre manual de ${block.boxCode} / ${block.blockName} con saldo ${remaining}? Esta operación afecta el inventario al finalizar PM.`)) return;
            const requestId = crypto.randomUUID();
            startTransition(async () => {
              try {
                await adminClosePaperBlockAction({ projectId, blockId: block.blockId, assignmentId: block.assignmentId, opening, reloads, remaining, reason: value.reason, requestId });
                setMessage(`Cierre manual guardado: ${block.boxCode} / ${block.blockName}.`);
                await load();
              } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cerrar."); }
            });
          }}>{pending ? "Guardando…" : `CERRAR ${block.blockName.toUpperCase()} MANUALMENTE`}</button>
        </>}
      </article>;
    })}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
