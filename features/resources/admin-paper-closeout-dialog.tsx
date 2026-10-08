"use client";

import { useState, useTransition } from "react";
import { adminForceStaffPaperCloseoutAction, loadAdminPaperCloseoutAction } from "@/features/projects/event-paper.actions";

type Props = { projectId: string; assignmentId: string; eventName: string; boxCode: string; onDone: () => void };

export function AdminPaperCloseoutDialog({ projectId, assignmentId, eventName, boxCode, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<{ opening_balance: number; final_remaining_balance: number | null; event_usage: number | null; status: string; reloads: number; format_key: string | null } | null>(null);
  const [remaining, setRemaining] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const show = () => {
    setMessage("");
    setOpen(true);
    startTransition(async () => {
      try {
        const result = await loadAdminPaperCloseoutAction(assignmentId);
        setSnapshot(result.snapshot);
        setRemaining(String(result.snapshot.final_remaining_balance ?? result.snapshot.opening_balance + result.snapshot.reloads));
      } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cargar el cierre."); }
    });
  };
  const close = () => { if (!pending) setOpen(false); };
  return <>
    <button type="button" className="mt-3 min-h-9 rounded-lg border border-brand/50 px-3 text-xs font-bold text-brand" onClick={show}>FORZAR CIERRE DE EVENTO</button>
    {open ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={`admin-paper-close-${assignmentId}`}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CIERRE ADMINISTRATIVO</p><h2 id={`admin-paper-close-${assignmentId}`} className="mt-1 text-xl font-semibold">{eventName}</h2><p className="mt-1 text-sm text-muted">Caja {boxCode} · no modifica pagos ni el estado comercial.</p></div><button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={close}>Cerrar</button></div>
        {snapshot ? <div className="mt-5 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg border p-3"><span className="block text-xs text-muted">Papel inicial</span><strong>{snapshot.opening_balance}</strong></div><div className="rounded-lg border p-3"><span className="block text-xs text-muted">Recargas</span><strong>{snapshot.reloads}</strong></div><div className="rounded-lg border p-3"><span className="block text-xs text-muted">Estado</span><strong>{snapshot.status}</strong></div><div className="rounded-lg border p-3"><span className="block text-xs text-muted">Consumo actual</span><strong>{snapshot.event_usage ?? "Pendiente"}</strong></div></div> : <p className="mt-5 text-sm text-muted">Cargando snapshot…</p>}
        <label className="mt-5 grid gap-1 text-sm font-semibold">Papel final real<input className="min-h-11 rounded-xl border bg-background px-3" type="number" min="0" step="1" value={remaining} onChange={(event) => setRemaining(event.target.value)} disabled={pending || !snapshot}/></label>
        <label className="mt-4 grid gap-1 text-sm font-semibold">Motivo obligatorio<textarea className="min-h-20 rounded-xl border bg-background p-3" value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} placeholder="Ej: operador no pudo completar el cierre"/></label>
        {message ? <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">{message}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={close}>Cancelar</button><button type="button" className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50" disabled={pending || !snapshot || !reason.trim() || !Number.isInteger(Number(remaining)) || Number(remaining) < 0} onClick={() => startTransition(async () => { try { const result = await adminForceStaffPaperCloseoutAction({ projectId, assetAssignmentId: assignmentId, finalRemaining: Number(remaining), reason }); setMessage(result.data?.duplicate ? "Este cierre ya estaba registrado." : "Cierre administrativo confirmado y Caja liberada."); if (!result.data?.duplicate) onDone(); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cerrar el evento."); } })}>{pending ? "PROCESANDO…" : "CONFIRMAR CIERRE"}</button></div>
      </div>
    </div> : null}
  </>;
}
