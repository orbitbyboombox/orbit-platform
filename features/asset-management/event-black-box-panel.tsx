"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, PackageCheck, RefreshCw, Trash2, X } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { assignBlackBoxToEventAction, loadEventBlackBoxOperationsAction, removeBlackBoxFromEventAction } from "./event-black-box.actions";

type Loaded = Awaited<ReturnType<typeof loadEventBlackBoxOperationsAction>>;

export function EventBlackBoxPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<Loaded | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => loadEventBlackBoxOperationsAction(projectId).then((next) => {
    setResult(next);
    if (next.ok) setSelectedAssetId(next.assignment?.asset_id ?? "");
  }), [projectId]);
  useEffect(() => { refresh(); }, [refresh]);

  const currentAssetId = result?.ok ? result.assignment?.asset_id : null;
  const available = useMemo(() => result?.ok ? result.assets.filter((asset) => asset.status !== "MAINTENANCE" && asset.status !== "OUT_OF_SERVICE" && (!asset.conflicts || asset.id === currentAssetId)) : [], [currentAssetId, result]);
  const currentAssetValue = result?.ok ? result.assignment?.operational_assets : null;
  const currentAsset = Array.isArray(currentAssetValue) ? currentAssetValue[0] : currentAssetValue;
  const snapshot = result?.ok ? result.snapshot : null;
  const project = result?.ok ? result.project : null;
  const paperStock = (asset: { metadata?: unknown }, openingBalance?: unknown) => {
    if (openingBalance !== undefined && openingBalance !== null) return Number(openingBalance);
    const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
    return Number(metadata.blackBoxPhotoStock ?? 0);
  };
  const currentPaperStock = currentAsset ? paperStock(currentAsset, snapshot?.black_box_initial_photo_stock) : null;
  const run = (operation: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage("Guardando asignación…");
    startTransition(async () => {
      const response = await operation();
      setMessage(response.ok ? "Caja Negra actualizada. El stock Master no fue modificado." : response.error ?? "No fue posible actualizar la Caja Negra.");
      if (response.ok) await refresh();
    });
  };

  if (!result) return <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Caja Negra del Evento"><p className="text-sm text-muted">Cargando Caja Negra…</p></section>;
  if (!result.ok) return <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Caja Negra del Evento"><p className="text-sm text-danger">{result.message}</p></section>;

  return <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Caja Negra del Evento">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><PackageCheck className="mt-1 size-5 shrink-0 text-brand" /><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CAJA / PAPEL</p><h3 className="mt-1 text-xl font-semibold">Caja Negra del Evento</h3><p className="mt-1 text-sm text-muted">Reserva la Caja para este Evento; el stock Master no se descuenta al asignar.</p></div></div>
      {currentAsset ? <StatusBadge label="Asignada" variant="success" /> : <StatusBadge label="Sin asignar" variant="warning" />}
    </div>
    <div className="mt-5 rounded-xl border bg-background/40 p-4"><div className="grid gap-4 sm:grid-cols-2"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted">CAJA ASIGNADA</p><p className="mt-1 text-lg font-semibold">{currentAsset ? `Caja ${Number(currentAsset.asset_code.slice(-2))}` : "Sin asignar"}</p></div><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted">PAPEL DISPONIBLE</p><p className="mt-1 text-lg font-semibold">{currentPaperStock === null ? "—" : `${currentPaperStock} fotos`}</p></div></div>{currentAsset && snapshot ? <p className="mt-2 text-xs text-muted">{snapshot.black_box_paper_format === "4X6_PREPICADO" ? "4x6 PREPICADO" : "4x6"} · Snapshot de asignación</p> : null}<div className="mt-4 flex flex-wrap gap-2"><ActionButton aria-busy={pending} disabled={pending} icon={RefreshCw} label={currentAsset ? "Cambiar Caja" : "Asignar Caja"} onClick={() => { setSelectedAssetId(currentAssetId ?? ""); setDialogOpen(true); }} />{currentAsset ? <ActionButton className="sm:ml-auto" icon={Trash2} aria-busy={pending} disabled={pending} label="Liberar Caja" onClick={() => run(() => removeBlackBoxFromEventAction({ projectId, reason: "Retiro manual desde Operación del Evento" }))} variant="outline" /> : null}</div></div>
    {message ? <p aria-live="polite" className="mt-3 text-sm font-medium">{message}</p> : null}
    {dialogOpen ? <BoxAssignmentDialog project={project} assets={available} currentAssetId={currentAssetId} selectedAssetId={selectedAssetId} pending={pending} paperStock={paperStock} onSelect={setSelectedAssetId} onClose={() => setDialogOpen(false)} onConfirm={() => { setDialogOpen(false); run(() => assignBlackBoxToEventAction({ projectId, assetId: selectedAssetId, reason: currentAsset ? "Reemplazo manual desde Operación del Evento" : "Asignación manual desde Operación del Evento" })); }} /> : null}
  </section>;
}

function BoxAssignmentDialog({ project, assets, currentAssetId, selectedAssetId, pending, paperStock, onSelect, onClose, onConfirm }: { project: { name?: string | null; event_date?: string | null } | null; assets: readonly { id: string; asset_code: string; status: string; metadata?: unknown; conflicts: boolean }[]; currentAssetId: string | null; selectedAssetId: string; pending: boolean; paperStock: (asset: { metadata?: unknown }) => number; onSelect: (id: string) => void; onClose: () => void; onConfirm: () => void }) {
  const selected = assets.find((asset) => asset.id === selectedAssetId);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="event-box-dialog-title"><div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-xl sm:rounded-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CAJA NEGRA / EQUIPAMIENTO</p><h4 id="event-box-dialog-title" className="mt-1 text-xl font-semibold">{currentAssetId ? "CAMBIAR CAJA DEL EVENTO" : "ASIGNAR CAJA AL EVENTO"}</h4><p className="mt-1 text-sm text-muted">{project?.name ?? "Este evento"}{project?.event_date ? ` · ${project.event_date}` : ""}</p></div><button type="button" aria-label="Cerrar" className="rounded-lg border p-2" onClick={onClose}><X className="size-4" /></button></div><div className="mt-5 grid gap-2">{assets.map((asset) => { const isCurrent = asset.id === currentAssetId; const blocked = !isCurrent && asset.conflicts; const unavailable = asset.status === "MAINTENANCE" || asset.status === "OUT_OF_SERVICE"; return <button type="button" key={asset.id} disabled={pending || blocked || unavailable} onClick={() => onSelect(asset.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selectedAssetId === asset.id ? "border-brand bg-brand/10" : "border-border bg-background/40"} ${blocked || unavailable ? "cursor-not-allowed opacity-50" : "hover:border-brand"}`}><span><span className="block font-semibold">Caja {Number(asset.asset_code.slice(-2))}</span><span className="mt-1 block text-xs text-muted">Papel disponible: {paperStock(asset)} fotos</span></span><span className="shrink-0 text-right text-xs font-semibold">{blocked ? "Ocupada en este horario" : unavailable ? "No disponible" : isCurrent ? "Asignada" : "Disponible"}</span></button>; })}</div>{selected ? <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm"><p className="font-semibold">Confirmar asignación</p><p className="mt-1 text-muted">Caja {Number(selected.asset_code.slice(-2))} · {paperStock(selected)} fotos disponibles</p></div> : null}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={onClose}>Cancelar</button><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50" disabled={pending || !selected || selected.id === currentAssetId || selected.conflicts || selected.status === "MAINTENANCE" || selected.status === "OUT_OF_SERVICE"} onClick={onConfirm}><Check className="size-4" />{pending ? "Guardando…" : "CONFIRMAR ASIGNACIÓN"}</button></div></div></div>;
}
