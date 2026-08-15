"use client";

import { useState, useTransition } from "react";
import { saveServiceAssetMappingAction, type ServiceAssetMapping } from "./service-asset-mapping.actions";

const ASSET_TYPES = ["TOTEM", "CASE", "CLASSIC_TOTEM", "BLACK_STUDIO", "BBOX360", "LIGHTBOX", "BOOMBALL", "PRINTER", "CAMERA", "LIGHT", "ACCESSORY"];

export function ServiceAssetMappingManager({ mappings }: { mappings: readonly ServiceAssetMapping[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = (form: HTMLFormElement) => startTransition(async () => {
    const result = await saveServiceAssetMappingAction(new FormData(form));
    setMessage(result.message);
  });
  return <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="service-resource-mapping-title">
    <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">Configuración operacional</p><h2 className="mt-2 text-xl font-semibold" id="service-resource-mapping-title">Relación servicio–recurso físico</h2><p className="mt-2 text-sm text-muted">Define cuántos equipos exige cada servicio y el buffer que protege su disponibilidad. No asigna equipos automáticamente.</p></div>
    <div className="space-y-3">{mappings.map((mapping) => <MappingForm disabled={pending} key={mapping.id} mapping={mapping} onSubmit={submit} />)}</div>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Agregar relación</summary><MappingForm disabled={pending} onSubmit={submit} /></details>
    <p className="text-sm font-medium" aria-live="polite">{message}</p>
  </section>;
}

function MappingForm({ mapping, disabled, onSubmit }: { mapping?: ServiceAssetMapping; disabled: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  return <form className="mt-3 grid gap-3 rounded-xl border bg-background/35 p-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}>
    <input name="id" type="hidden" value={mapping?.id ?? ""} /><input name="version" type="hidden" value={mapping?.version ?? 1} />
    <label className="text-xs font-medium text-muted">Servicio<input className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" defaultValue={mapping?.serviceCode ?? ""} disabled={Boolean(mapping)} name="serviceCode" placeholder="CLASSIC" required /></label>
    <label className="text-xs font-medium text-muted">Tipo de activo<select className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" defaultValue={mapping?.assetType ?? "TOTEM"} disabled={Boolean(mapping)} name="assetType">{ASSET_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label className="text-xs font-medium text-muted">Unidades<input className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" defaultValue={mapping?.unitsPerService ?? 1} min="0.001" name="unitsPerService" required step="0.001" type="number" /></label>
    <label className="text-xs font-medium text-muted">Buffer antes<input className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" defaultValue={mapping?.bufferBeforeMinutes ?? 0} min="0" name="bufferBeforeMinutes" required step="1" type="number" /></label>
    <label className="text-xs font-medium text-muted">Buffer después<input className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" defaultValue={mapping?.bufferAfterMinutes ?? 0} min="0" name="bufferAfterMinutes" required step="1" type="number" /></label>
    <div className="flex items-end gap-3"><label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={mapping?.enabled ?? true} name="enabled" type="checkbox" />Activa</label><button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-black disabled:opacity-50" disabled={disabled} type="submit">Guardar</button></div>
  </form>;
}
