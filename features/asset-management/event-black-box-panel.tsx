"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { PackageCheck, RefreshCw, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { assignBlackBoxToEventAction, loadEventBlackBoxOperationsAction, removeBlackBoxFromEventAction } from "./event-black-box.actions";

type Loaded = Awaited<ReturnType<typeof loadEventBlackBoxOperationsAction>>;

export function EventBlackBoxPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<Loaded | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [message, setMessage] = useState("");
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
    {currentAsset && snapshot ? <div className="mt-5 rounded-xl border bg-background/40 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{snapshot.black_box_name ?? currentAsset.asset_code}</p><p className="text-sm text-muted">{snapshot.black_box_asset_code ?? currentAsset.asset_code} · Snapshot de asignación</p></div><div className="text-right"><p className="text-lg font-semibold">{Number(snapshot.black_box_initial_photo_stock ?? 0)} fotos iniciales</p><p className="text-sm text-muted">{snapshot.black_box_paper_format === "4X6_PREPICADO" ? "4x6 PREPICADO" : "4x6"}</p></div></div><ActionButton className="mt-4" icon={Trash2} aria-busy={pending} disabled={pending} label="Quitar Caja del Evento" onClick={() => run(() => removeBlackBoxFromEventAction({ projectId, reason: "Retiro manual desde Operación del Evento" }))} variant="outline" /></div> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
      <select aria-label="Caja Negra" className="min-h-11 rounded-xl border bg-background px-3 text-sm" disabled={pending} onChange={(event) => setSelectedAssetId(event.target.value)} value={selectedAssetId}>
        <option value="">{currentAsset ? "Seleccionar reemplazo…" : "Seleccionar Caja Negra…"}</option>
        {available.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_code} · Caja {Number(asset.asset_code.slice(-2))} · {asset.status === "ASSIGNED" ? "Asignada" : "Disponible"}</option>)}
      </select>
      <ActionButton aria-busy={pending} disabled={pending || !selectedAssetId} icon={RefreshCw} label={currentAsset ? "Reemplazar Caja" : "Asignar Caja"} onClick={() => run(() => assignBlackBoxToEventAction({ projectId, assetId: selectedAssetId, reason: currentAsset ? "Reemplazo manual desde Operación del Evento" : "Asignación manual desde Operación del Evento" }))} />
    </div>
    {message ? <p aria-live="polite" className="mt-3 text-sm font-medium">{message}</p> : null}
  </section>;
}
